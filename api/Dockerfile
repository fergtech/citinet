FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev --ignore-scripts

COPY server.js .

EXPOSE 9090

# Run as non-root
USER node

CMD ["node", "server.js"]
