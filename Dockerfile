# ---- Stage 1: build the frontend ----
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
# `npm install`, not `npm ci` — the committed lockfile was generated on Windows,
# and npm resolves some platform-conditional peer deps (@napi-rs/wasm-runtime's
# WASM fallback for native binaries) differently per-OS. `npm ci` demands a
# byte-perfect match and fails on that drift; `npm install` reconciles it.
RUN npm install
COPY frontend/ ./
# Frontend and backend share one origin in this deployment (no separate domains/
# ports — see config.js) — leave this empty so API calls resolve as plain
# relative paths against whatever host the app is actually served from.
ENV VITE_API_BASE_URL=""
RUN npm run build

# ---- Stage 2: the backend, serving the API + the built frontend + the admin panel ----
FROM node:22-slim AS app
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ ./
# Lands alongside the existing admin.html/admin.js — no filename collision
# (frontend/dist has its own index.html + assets/, backend/public has neither).
COPY --from=frontend-build /app/frontend/dist ./public

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "--no-warnings", "src/server.js"]
