FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

COPY instrumentation.js ./

RUN npm ci --omit=dev

COPY server.js ./

EXPOSE 3000

CMD ["node", "-r", "./instrumentation.js", "server.js"]
