const ALLOWED_ORIGINS = new Set([
  "https://kashisolarandrenewables.in",
  "https://www.kashisolarandrenewables.in",
  "https://dynamic-melba-ca4f75.netlify.app",
  "http://localhost:8888"
]);

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 12;

globalThis.__ksrSolarCache = globalThis.__ksrSolarCache || new Map();
globalThis.__ksrSolarRate = globalThis.__ksrSolarRate || new Map();

function json(statusCode, body, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return { statusCode, headers, body: JSON.stringify(body) };
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  const deployUrls = [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL].filter(Boolean);
  if (deployUrls.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return /^(?:deploy-preview-\\d+|[a-z0-9-]+)--dynamic-melba-ca4f75\\.netlify\\.app$/.test(host);
  } catch {
    return false;
  }
}

function dateLabel(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (typeof value === "object" && value.year) {
    const month = String(value.month || 1).padStart(2, "0");
    const day = String(value.day || 1).padStart(2, "0");
    return `${value.year}-${month}-${day}`;
  }
  return null;
}

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function consumeRateLimit(ip) {
  const now = Date.now();
  const bucket = globalThis.__ksrSolarRate.get(ip) || [];
  const recent = bucket.filter(time => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    globalThis.__ksrSolarRate.set(ip, recent);
    return false;
  }
  recent.push(now);
  globalThis.__ksrSolarRate.set(ip, recent);
  if (globalThis.__ksrSolarRate.size > 500) {
    for (const [key, times] of globalThis.__ksrSolarRate) {
      if (!times.some(time => now - time < RATE_WINDOW_MS)) globalThis.__ksrSolarRate.delete(key);
    }
  }
  return true;
}

function withinIndia(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= 6 && latitude <= 38.8 && longitude >= 68 && longitude <= 98;
}

async function geocodeAddress(address, apiKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("components", "country:IN");
  url.searchParams.set("region", "IN");
  url.searchParams.set("key", apiKey);

  const { response, data } = await fetchJson(url.toString());
  if (!response.ok) throw new Error("Google address lookup is temporarily unavailable.");
  if (data.status === "ZERO_RESULTS") {
    const error = new Error("We could not find that address. Try adding the house number, locality, city and PIN code.");
    error.statusCode = 400;
    throw error;
  }
  if (data.status !== "OK" || !Array.isArray(data.results) || !data.results[0]) {
    throw new Error("Google could not verify that address. Please try a more complete address or use your current location.");
  }

  const match = data.results[0];
  const country = (match.address_components || []).find(component =>
    (component.types || []).includes("country")
  );
  if (!country || country.short_name !== "IN") {
    const error = new Error("This rooftop checker currently accepts property locations in India only.");
    error.statusCode = 400;
    throw error;
  }
  const point = match.geometry && match.geometry.location;
  if (!point || !withinIndia(Number(point.lat), Number(point.lng))) {
    const error = new Error("The address is outside the supported India location range. Please check the address.");
    error.statusCode = 400;
    throw error;
  }
  return {
    latitude: Number(point.lat),
    longitude: Number(point.lng),
    formattedAddress: match.formatted_address || address
  };
}

async function getBuildingInsights(latitude, longitude, apiKey) {
  const url = new URL("https://solar.googleapis.com/v1/buildingInsights:findClosest");
  url.searchParams.set("location.latitude", String(latitude));
  url.searchParams.set("location.longitude", String(longitude));
  url.searchParams.set("requiredQuality", "MEDIUM");
  url.searchParams.set("key", apiKey);

  const { response, data } = await fetchJson(url.toString(), 18000);
  if (response.status === 404) {
    const error = new Error("Google Solar imagery is not currently available for a matching building at this location. Try using GPS while standing at the property, or request a manual roof assessment.");
    error.statusCode = 404;
    throw error;
  }
  if (!response.ok) {
    const status = data && data.error && data.error.status;
    if (status === "PERMISSION_DENIED" || status === "API_KEY_INVALID") {
      throw new Error("Google Solar API is not enabled for this project or its API key is not authorised. Please contact the website administrator.");
    }
    if (status === "RESOURCE_EXHAUSTED") {
      const error = new Error("The rooftop checker has reached its current request limit. Please try again later or contact our team.");
      error.statusCode = 429;
      throw error;
    }
    throw new Error("Google Solar could not complete this assessment right now. Please try again or contact our team.");
  }

  const potential = data.solarPotential || {};
  const panelCount = Number(potential.maxArrayPanelsCount || 0);
  const panelWatts = Number(potential.panelCapacityWatts || 0);
  const configs = Array.isArray(potential.solarPanelConfigs) ? potential.solarPanelConfigs : [];
  const largestConfig = configs.reduce((best, item) =>
    !best || Number(item.panelsCount || 0) > Number(best.panelsCount || 0) ? item : best, null
  );
  const annualEnergy = largestConfig ? Number(largestConfig.yearlyEnergyDcKwh || 0) : null;

  if (!panelCount || !panelWatts) {
    const error = new Error("Google returned incomplete roof data for this building. Please request a manual assessment.");
    error.statusCode = 404;
    throw error;
  }

  const imageryDate = dateLabel(data.imageryDate);
  return {
    formattedAddress: null,
    postalCode: data.postalCode || null,
    administrativeArea: data.administrativeArea || null,
    regionCode: data.regionCode || "IN",
    imageryQuality: data.imageryQuality || "Not specified",
    imageryDate,
    solarPotential: {
      maxArrayPanelsCount: panelCount,
      panelCapacityWatts: panelWatts,
      maxSystemCapacityKw: Number(((panelCount * panelWatts) / 1000).toFixed(2)),
      maxArrayAreaM2: Number(potential.maxArrayAreaMeters2 || 0),
      roofAreaM2: Number(potential.maxArrayAreaMeters2 || 0),
      maxSunshineHoursPerYear: Number(potential.maxSunshineHoursPerYear || 0),
      estimatedAnnualEnergyDcKwh: annualEnergy
    }
  };
}

exports.handler = async function (event) {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  if (!isAllowedOrigin(origin)) {
    return json(403, { code: "ORIGIN_NOT_ALLOWED", message: "This website origin is not allowed to use the rooftop checker." });
  }
  if (event.httpMethod === "OPTIONS") return json(204, {}, origin);
  if (event.httpMethod !== "POST") {
    return json(405, { code: "METHOD_NOT_ALLOWED", message: "Use POST for a rooftop assessment." }, origin);
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return json(503, { code: "SOLAR_SETUP_REQUIRED", message: "The Google Solar connection is not configured yet. Please contact our team for a manual roof assessment." }, origin);
  }

  const ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"])) || "unknown";
  if (!consumeRateLimit(String(ip).split(",")[0].trim())) {
    return json(429, { code: "RATE_LIMITED", message: "Too many checks were requested from this connection. Please wait a minute and try again." }, origin);
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { code: "INVALID_JSON", message: "Please enter a valid address or select a location." }, origin);
  }

  let latitude = Number(body.latitude);
  let longitude = Number(body.longitude);
  let formattedAddress = null;

  if (typeof body.address === "string" && body.address.trim()) {
    const address = body.address.trim();
    if (address.length < 4 || address.length > 300) {
      return json(400, { code: "INVALID_ADDRESS", message: "Please enter a property address between 4 and 300 characters." }, origin);
    }
    try {
      const geocoded = await geocodeAddress(address, apiKey);
      latitude = geocoded.latitude;
      longitude = geocoded.longitude;
      formattedAddress = geocoded.formattedAddress;
    } catch (error) {
      return json(error.statusCode || 502, { code: "GEOCODING_FAILED", message: error.message }, origin);
    }
  } else if (!withinIndia(latitude, longitude)) {
    return json(400, { code: "LOCATION_REQUIRED", message: "Enter an Indian property address or use your current location while at the property." }, origin);
  }

  const cacheKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const cached = globalThis.__ksrSolarCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    return json(200, { ...cached.data, formattedAddress: formattedAddress || cached.data.formattedAddress }, origin);
  }

  try {
    const result = await getBuildingInsights(latitude, longitude, apiKey);
    result.formattedAddress = formattedAddress || [result.postalCode, result.administrativeArea].filter(Boolean).join(", ") || "Selected property location";
    globalThis.__ksrSolarCache.set(cacheKey, { savedAt: Date.now(), data: result });
    if (globalThis.__ksrSolarCache.size > 500) {
      const oldestKey = globalThis.__ksrSolarCache.keys().next().value;
      globalThis.__ksrSolarCache.delete(oldestKey);
    }
    return json(200, result, origin);
  } catch (error) {
    return json(error.statusCode || 502, { code: "SOLAR_LOOKUP_FAILED", message: error.message || "The rooftop assessment could not be completed." }, origin);
  }
};
