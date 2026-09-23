FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

EXPOSE 8000

ENV PORT=8000
ENV HOST=0.0.0.0
ENV HEARTBEAT_TIMEOUT_SECONDS=30.0

CMD ["node", "src/server.js"]
