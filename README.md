# Kashi Solar & Renewables Website

English marketing website for Kashi Solar & Renewables, with a customer-facing Google Solar rooftop-potential checker.

## Website features

- No solar system prices are displayed.
- Free estimate form with email notification and WhatsApp handoff.
- Residential, commercial, industrial and EPC customer paths.
- PM Surya Ghar guidance and bank-financing information.
- Existing project photos and the supplied KSR logo.
- Google Solar Building Insights rooftop estimate with an address/GPS input.
- A manual-assessment WhatsApp fallback when Google has no matching building imagery.

## Local build

Requirements: Node.js 20 or later.

```bash
npm run build
```

The build creates `dist/` with the static website. Netlify Functions are deployed separately from `netlify/functions/`.

## Netlify deployment

1. Connect this repository to the Netlify site used for the private preview. For a preview-only site, set its production branch to `redesign/vibrant-3d-experience`; do not connect the business domain to this preview site.
2. Use the settings in `netlify.toml`: build command `npm run build`, publish directory `dist`, functions directory `netlify/functions`.
3. In Netlify Site configuration → Environment variables, add `GOOGLE_MAPS_API_KEY` as a **secret**. Never add the key to HTML, JavaScript, GitHub commits or a public file.
4. Redeploy the site after setting the environment variable.
5. Test the Solar checker on a specific property in Raebareli, then test at least one other district. Google Solar imagery is not available for every building.

## Google Cloud setup

In the Google Cloud project that owns the billing account:

1. Enable billing.
2. Enable **Solar API** and **Geocoding API**.
3. Create a dedicated API key for this server-side Netlify function.
4. Under API restrictions, allow only Solar API and Geocoding API. Keep the key in Netlify's private environment variables, and set conservative daily quotas/alerts in Google Cloud.
5. Check the current India pricing list before making the checker public. Solar Building Insights uses pay-as-you-go billing per successful request; Google notes that NOT_FOUND building lookups are not billed but still count against quotas.

## Accuracy, privacy and attribution

- Address text is sent to Google Geocoding API; GPS coordinates or geocoded coordinates are sent to Google Solar API.
- The function only accepts India-range coordinates and applies a best-effort per-IP request limit.
- Successful rooftop results are held in a short-lived in-memory cache (6 hours), below Google's 30-day Solar Data caching maximum. The cache is not durable and may be cleared when a serverless instance stops.
- Results are preliminary modelled insights, not an installation design, quote, savings guarantee or substitute for a physical site survey.
- Solar API data display includes the attribution: **Source: Includes solar data from Google**. Geocoded address attribution is shown as **Google Maps**.
- See `privacy-policy.html` for the location-data explanation.
