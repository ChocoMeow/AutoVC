# https://hub.docker.com/r/oven/bun
FROM oven/bun:1.3.10-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json bunfig.toml ./
COPY src ./src

RUN mkdir -p logs

ENV NODE_ENV=production

# Mount config at runtime: -v ./config.json:/app/config.json
# Or set AUTOVC_* environment variables (see .env.example).
CMD ["bun", "run", "start"]
