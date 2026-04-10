# Stage 1 — Build the React portal
FROM node:20-alpine AS portal-builder
WORKDIR /portal
COPY package.json package-lock.json* ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts postcss.config.mjs ./
COPY public ./public
COPY src ./src
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
