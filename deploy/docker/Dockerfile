# syntax=docker/dockerfile:1.7
# One Dockerfile, four runtime targets: `shell`, `remote` (APP=portfolio|trading|compliance|blotter), `bff`.
# Every frontend image is plain static files behind nginx; environment-specific
# values (remote URLs, origins, upstreams) are injected at container start, so
# the SAME image is promoted from dev to production ("build once, deploy anywhere").

FROM node:22.13-alpine AS deps
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM deps AS build
COPY . .
ARG SHELL_VERSION=1.0.0
ENV SHELL_VERSION=${SHELL_VERSION} NX_DAEMON=false NX_NO_CLOUD=true
RUN npx nx run-many -t build -p shell portfolio trading compliance blotter bff --parallel=3

# ---------------------------------------------------------------- static base
# Unprivileged nginx: the master process runs as `nginx` (uid 101), not root.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS static-base
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/docker/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
USER nginx
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

# ---------------------------------------------------------------------- shell
FROM static-base AS shell
# The entrypoint renders config/remotes.json at start, so the html tree belongs to nginx.
COPY --chown=nginx:nginx --from=build /workspace/apps/shell/dist /usr/share/nginx/html
COPY deploy/docker/nginx/shell.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=0755 deploy/docker/40-render-remotes.sh /docker-entrypoint.d/40-render-remotes.sh
ENV BFF_UPSTREAM=bff:3333
EXPOSE 8080

# -------------------------------------------------------------------- remotes
FROM static-base AS remote
ARG APP
COPY --from=build /workspace/apps/${APP}/dist /usr/share/nginx/html
COPY deploy/docker/nginx/remote.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 8080

# ------------------------------------------------------------------------ bff
# Self-contained esbuild bundle: no node_modules in the runtime image.
FROM node:22.13-alpine AS bff
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3333
COPY --from=build /workspace/apps/bff/dist ./dist
USER node
EXPOSE 3333
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:3333/healthz || exit 1
CMD ["node", "--enable-source-maps", "dist/main.cjs"]
