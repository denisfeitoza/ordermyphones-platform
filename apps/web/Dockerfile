# syntax=docker/dockerfile:1.7

# --------- 1. Build ---------
FROM node:20-alpine AS build
WORKDIR /app

# Cache deps separately for fast rebuilds
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_STRIPE_PUBLISHABLE_KEY
ARG VITE_SENTRY_DSN
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ARG VITE_AI_API_BASE
ENV NODE_ENV=production
RUN npm run build

# --------- 2. Runtime ---------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS prod
# Drop server tokens, set sensible defaults
COPY --from=build /app/dist /usr/share/nginx/html
COPY <<'NGINX' /etc/nginx/conf.d/default.conf
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # SPA fallback
  location / {
    try_files $uri /index.html;
  }

  # Long cache on hashed assets
  location ~* \.(?:js|css|svg|woff2?|png|jpg|jpeg|gif|webp)$ {
    expires 30d;
    add_header Cache-Control "public, max-age=2592000, immutable";
    try_files $uri =404;
  }

  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "interest-cohort=()" always;
}
NGINX

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ || exit 1
