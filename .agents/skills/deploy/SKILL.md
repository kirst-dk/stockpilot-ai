---
name: deploy-stockpilot
description: How to build and deploy the StockPilot AI frontend (app.stockpilotai.xyz) to the production server. Use when asked to deploy, redeploy, or push frontend changes live.
---

# Deploying StockPilot AI (app.stockpilotai.xyz)

The live app is a **Next.js static export** served by **nginx**. There is no app server / PM2 /
Docker — just static files in a docroot. The landing page (`stockpilotai.xyz`) is separate static
HTML in `/var/www/landing`.

## Server

- Host: `2.26.7.184` (hostname `Mantle.play2go.cloud`), Ubuntu 24.04, user `root`.
- Password is a Devin secret (do NOT hardcode). If missing, request it; connect with
  `sshpass -e ssh root@2.26.7.184` after `export SSHPASS=...`.
- App docroot: `/var/www/app`. Nginx site config: `/etc/nginx/sites-enabled/stockpilot`.
- Nginx proxies `/api/nansen`, `/api/elfa`, `/api/altllm`, `/api/fluxion` to upstream APIs and
  injects the API keys server-side, so the frontend build needs no API keys.

## Build

```bash
cd frontend
npm install
npm run build        # output: "export" -> produces frontend/out/
```

Build warnings about `@react-native-async-storage/async-storage`, `pino-pretty`, and `ox` are
benign (optional wallet deps) and do not fail the build.

## Deploy (atomic swap, with backup)

```bash
cd frontend
tar -czf /tmp/app-out.tgz -C out .
sshpass -e scp /tmp/app-out.tgz root@2.26.7.184:/tmp/app-out.tgz
sshpass -e ssh root@2.26.7.184 'set -e; \
  cp -a /var/www/app /var/www/app.bak-$(date +%s); \
  rm -rf /var/www/app.new; mkdir -p /var/www/app.new; \
  tar -xzf /tmp/app-out.tgz -C /var/www/app.new; \
  chown -R 1000:1000 /var/www/app.new; \
  rm -rf /var/www/app.prev; mv /var/www/app /var/www/app.prev; mv /var/www/app.new /var/www/app; \
  nginx -t && systemctl reload nginx'
```

## Verify

Each build has a unique build id under `/var/www/app/_next/<id>`. Confirm the new id appears in
the served HTML:

```bash
curl -s https://app.stockpilotai.xyz/ | grep -o '_next/static/[A-Za-z0-9_-]*/' | sort -u
```

## Rollback

```bash
sshpass -e ssh root@2.26.7.184 'mv /var/www/app /var/www/app.broken && mv /var/www/app.prev /var/www/app && systemctl reload nginx'
```

## Notes

- All app UI lives in `frontend/src/app/page.tsx`; the Stocky concierge is in
  `frontend/src/components/concierge` + `frontend/src/lib/intelligence`. Global styles and Relay
  widget overrides are in `frontend/src/app/globals.css`.
- The Devin git proxy CAN clone/push this repo over plain HTTPS (no PAT needed in-session).
