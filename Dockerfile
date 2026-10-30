# Build stage: compile the React client and the TypeScript server.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: Node plus the toolchains that compile and run user code.
FROM node:22-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ gdb openjdk-17-jdk-headless python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3001 TRUST_PROXY=1
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
# Run as the unprivileged "node" user that ships with the image.
USER node
EXPOSE 3001
CMD ["node", "server/dist/index.js"]
