# One container: the Fastify + Socket.IO server serves the built client.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
COPY packages/engine/package.json packages/engine/
COPY packages/case-schema/package.json packages/case-schema/
COPY cases/missing-original/package.json cases/missing-original/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
COPY --from=build /app /app
EXPOSE 8080
CMD ["npm", "start"]
