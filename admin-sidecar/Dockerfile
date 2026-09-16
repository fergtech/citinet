# Small, single-purpose image -- no portal to bundle, unlike citinet-api's
# Dockerfile. Runs as root (no USER directive): reading the bind-mounted
# /var/run/docker.sock reliably needs it, the same reason most docker-socket
# sidecars (docker-socket-proxy, Portainer agent, etc.) don't drop privileges
# either. The actual safety boundary is this container never being reachable
# from outside the Docker network (no `ports:` in docker-compose.yml) plus
# the ADMIN_SIDECAR_TOKEN check in server.js -- not this container's own UID.
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY server.js ./
EXPOSE 7070
CMD ["node", "server.js"]
