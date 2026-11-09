# Splitboard

Shared stopwatches with live day/week totals, lap notes, and saved sessions. **Reset all** preserves a frozen copy of every stopwatch, including laps and notes, then stops and zeros the active stopwatches. Expand rows under Saved sessions to read the notes. No automatic midnight reset.

## Run

Use Node.js 22 or newer and PostgreSQL. Set `DATABASE_URL` and a random `APP_ACCESS_CODE` of at least 24 characters in the environment. Copy `.env.example` for reference (the server reads environment variables, not `.env` automatically).

```
npm ci
npm test
npm start
```

Open http://localhost:3000 and enter the access code. Use the same code on your phone. The server stores all session data in PostgreSQL, so it survives web-service restarts and deployments. Dates use America/New_York; weeks start Monday.

An optional `INITIAL_SESSION_STATE` environment variable imports an existing session JSON into an empty database only. Never commit session data or credentials. The `/health` endpoint checks database readiness.

## Render

Deploy the Node server with `npm ci` as the build command and `npm start` as the start command. Configure `DATABASE_URL` with the database's internal connection string, and set `APP_ACCESS_CODE` as a secret environment variable. Use `/health` for the health check. The public URL requires the access code before showing stopwatch data.

Free Render Postgres expires after 30 days. Use a paid database for ongoing storage. A free web service can spin down on idle; stopwatch elapsed time still derives from persisted timestamps when it wakes.

The original Cloudflare Sites build remains available through `npm run build:sites`; the Node/Render deployment does not depend on it.

The default Render Blueprint uses an external PostgreSQL database (for example, Railway). Set `DATABASE_URL` to its **public/TCP-proxy** URL because Render cannot access Railway's private hostname. Keep the connection URL in Render environment variables, never in GitHub. `deploy/render-persistent.yaml` is an optional alternative that provisions paid Render Postgres.
