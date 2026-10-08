HUNCH CLUB V3 — NETLIFY ONLY PROTOTYPE

No Supabase. Uses Netlify Functions + Netlify Blobs.

IMPORTANT: A plain drag-and-drop ZIP deployment via Netlify Drop generally does NOT build/deploy the required serverless function. Deploy this source through a Git-connected Netlify site (recommended) or the Netlify CLI with function support. The build requires installing package.json dependencies. If you upload the ZIP only as static files, Create Game will fail with a backend-unavailable message.

Prototype features:
- Create a game and join using a 6-character code
- Host-only Start Game
- Shared player list and game status polling every 3 seconds
- Local session recovery after refresh or reopening on the same browser
- Each player's test YES/NO choice stored server-side in Netlify Blobs

Limitations: This is NOT a production-ready competitive game. The test question has no live match and no outcome settlement; there is no account login or strong identity verification, and game status updates do not use a transactional database. For production, add proper auth, rate limiting, expiry, anti-abuse controls and an authoritative event/results pipeline.
