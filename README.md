# Kashi Solar & Renewables Website

Customer-facing website plus an internal, team-operated Google Solar rooftop assessment tool.

## Customer journey

1. A prospective customer submits the public estimate form or contacts Kashi Solar by WhatsApp/phone.
2. The Kashi Solar team records the lead in its CRM and obtains/confirms the property location with the customer.
3. An authorised team member opens the internal assessment page and checks Google Solar data for the property.
4. The team verifies the site physically and prepares a customised system recommendation and quotation.
5. The team may share a clearly labelled preliminary summary with the customer over WhatsApp.

**Customers do not run the Google Solar assessment themselves.** The public homepage contains no customer-facing roof checker.

## Internal team assessment page

- URL on the Netlify preview site: `/team-solar-assessment.html`
- Not linked from the public website navigation; the page has `noindex,nofollow` and `robots.txt` disallows it.
- A team access code is required for every API request.
- Staff can enter the CRM Lead ID, customer details and full property address.
- Assessment results can be copied for CRM notes; a preliminary WhatsApp summary can be opened for the customer's mobile number.
- The team must confirm site conditions before a final system design or quotation.

This is a shared-code gate, not individual employee identity management. Share the access code only with authorised staff and rotate it if it is disclosed. A hidden/unlinked page and robots.txt are not security controls by themselves; the server-side access token is the actual API protection.

## Local build

Requirements: Node.js 20 or later.

```bash
npm run build
```

The build creates `dist/` with the public website, privacy policy, internal team assessment page and robots.txt. Netlify Functions deploy separately from `netlify/functions/`.

## Netlify preview deployment

1. Connect the GitHub repository to the existing Netlify preview site.
2. Set the site's production branch to `redesign/vibrant-3d-experience`. Keep the business domain disconnected from this preview site.
3. Use the configuration in `netlify.toml`: build command `npm run build`, publish directory `dist`, functions directory `netlify/functions`.
4. In Netlify Site configuration → Environment variables, add two **secret** variables:
   - `GOOGLE_MAPS_API_KEY` — the restricted Google Cloud API key.
   - `ASSESSMENT_ACCESS_TOKEN` — a long, random access code shared only with authorised Kashi Solar staff.
5. Trigger a new deploy after saving both environment variables.
6. Open the internal tool at `https://<netlify-preview-host>/team-solar-assessment.html` and test one property in Raebareli. Then test another service district.

Never place either secret in HTML, JavaScript, GitHub files, chat, a customer WhatsApp message or a public document. Do not connect the production domain or change DNS as part of the preview setup.

## Google Cloud setup

In the Google Cloud project that owns billing:

1. Enable billing.
2. Enable **Solar API** and **Geocoding API**.
3. Create a dedicated API key for the server-side Netlify function.
4. Under API restrictions, allow only Solar API and Geocoding API.
5. Set daily quotas and budget alerts; check the current India pricing before enabling wider team usage.

## Privacy, accuracy and attribution

- Property addresses entered by staff are sent to Google Geocoding API; resulting coordinates are sent to Google Solar API.
- Use this assessment only after the customer has expressed interest and shared the property location for a solar assessment.
- The function accepts India-range coordinates, checks the team access token, applies a best-effort per-IP request limit and temporarily caches results in memory for six hours.
- Google Solar data may not be available for all buildings. A failed lookup should lead to a manual site assessment, not an invented result.
- Results are modelled insights, not a confirmed installation design, quotation, savings guarantee or substitute for a physical site survey.
- Display attribution: **Source: Includes solar data from Google**; geocoded address lookup is attributed to Google Maps.
- See `privacy-policy.html` for the location-data explanation.
