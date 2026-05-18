# StockPilot AI — Deployment Guide

## Architecture

```
www.stockpilotai.xyz → Landing Page (static HTML)
app.stockpilotai.xyz → Application (Next.js static export)
```

## Server Setup

### Requirements
- Ubuntu 24.04+
- Nginx
- Certbot (for SSL)

### 1. Install dependencies
```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
```

### 2. Deploy files
```bash
# Landing page
mkdir -p /var/www/landing
cp landing/index.html /var/www/landing/

# Application (build first)
cd frontend && npm run build
mkdir -p /var/www/app
cp -r out/* /var/www/app/
```

### 3. Configure Nginx
```bash
cp deploy/nginx.conf /etc/nginx/sites-available/stockpilot
ln -sf /etc/nginx/sites-available/stockpilot /etc/nginx/sites-enabled/stockpilot
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

### 4. SSL Certificate
```bash
certbot --nginx -d www.stockpilotai.xyz -d app.stockpilotai.xyz -d stockpilotai.xyz \
  --non-interactive --agree-tos --email kirstbeats@gmail.com --redirect
```

### DNS Records
| Name | Type | Value |
|------|------|-------|
| @ | A | 2.26.7.184 |
| www | A | 2.26.7.184 |
| app | A | 2.26.7.184 |
