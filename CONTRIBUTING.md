# Contributing

Use Node.js 22.13+ and npm. Run `npm ci`, `npm test`, `npm run build`, `node scripts/check-public.mjs`, then `npm run package` and `npm run smoke` with port 8790 free. For UI tests, run `npx playwright install chromium` once, followed by `node scripts/ui-test.mjs`.

Keep agent integrations read-only. Add synthetic fixtures for each supported schema and test missing fields, malformed data, sampled files, streaming duplicates, rewinds and offline sources. Never commit real session files, authentication state, machine-specific paths or private screenshots. New metadata must be allowlisted before reaching the API. Unsupported versions must fail visibly and independently.

The connector center modifies only Shrinkcage settings after explicit folder approval. Do not introduce arbitrary command execution, local URL fetching, agent configuration changes, session resume/control actions or inferred billing claims.

Use focused changes with a clear description and validation results. Preserve responsive light/dark layouts, keyboard access and reduced-motion behavior. Release/version changes must update package.json, the lockfile, bin/launch.mjs and server version responses together.
