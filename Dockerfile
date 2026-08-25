# Imagen única: construye el cliente y lo sirve desde el mismo Express que la API.
# Un solo servicio y un solo puerto, que es lo que esperan Render, Railway, Fly,
# Coolify, Dokploy o un VPS con docker compose.

# --- 1. build del cliente ---
FROM node:22-alpine AS cliente
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- 2. imagen final ---
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# Deps del backend, solo producción
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
COPY --from=cliente /app/client/dist ./client/dist

# DATA_DIR es el punto de montaje del disco persistente. Arranca vacío y el
# servidor lo siembra desde server/seed en el primer arranque.
ENV DATA_DIR=/data
VOLUME ["/data"]

ENV PORT=4000
EXPOSE 4000

# healthcheck contra el endpoint que ya expone el estado de la carga
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
