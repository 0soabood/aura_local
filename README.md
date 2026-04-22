<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/84cd1498-09cd-496e-a29f-e8dca0d0ae0f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Domain Contract (Source of Truth)

The canonical domain contract lives in [src/shared/types.ts](src/shared/types.ts):

- `VERIFICATION_STATES`: allowed lifecycle states for all verification-enabled records.
- `VERIFIED_VERIFICATION_STATES`: trusted states used by telemetry health.
- `TELEMETRY_FORMULAS`: human-readable formula contract for each metric.

Implementation note:

- Telemetry computation must stay aligned with these shared constants, and `StatsRepository` is expected to implement them exactly.
