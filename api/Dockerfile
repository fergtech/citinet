# Stage 1 — Build the React portal
FROM node:20-alpine AS portal-builder
WORKDIR /portal
COPY package.json package-lock.json* ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts postcss.config.mjs ./
COPY public ./public
COPY src ./src
# Bake in the production registry URLs so the bundled portal can reach
# the Vercel registry API even when served directly from the hub container.
ENV VITE_REGISTRY_URL=https://raw.githubusercontent.com/fergtech/citinet-registry/main/registry.json
ENV VITE_REGISTRY_API_URL=https://citinet.cloud/api/registry
RUN npm run build

# Stage 2 — Production API image with portal bundled
FROM node:18-alpine
WORKDIR /app
COPY api/package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY api/server.js ./
COPY --from=portal-builder /portal/dist ./dist
EXPOSE 9090
USER node
CMD ["node", "server.js"]
