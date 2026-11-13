FROM node:22-alpine AS base

# ── Install oasdiff (pinned version) ─────────────────────────────────────────
ARG OASDIFF_VERSION=1.35.0
RUN apk add --no-cache curl ca-certificates && \
    curl -sSL "https://github.com/tufin/oasdiff/releases/download/v${OASDIFF_VERSION}/oasdiff_${OASDIFF_VERSION}_linux_amd64.tar.gz" \
    -o /tmp/oasdiff.tar.gz && \
    tar -xzf /tmp/oasdiff.tar.gz -C /usr/local/bin oasdiff && \
    chmod +x /usr/local/bin/oasdiff && \
    oasdiff --version && \
    rm /tmp/oasdiff.tar.gz && \
    apk del curl

# ── Install pnpm ──────────────────────────────────────────────────────────────
RUN npm install -g pnpm@9

# ── App ───────────────────────────────────────────────────────────────────────
WORKDIR /app
COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src/ ./src/
COPY policies/ ./policies/

# ── Environment defaults (override via Railway env vars) ─────────────────────
ENV OASDIFF_BINARY=/usr/local/bin/oasdiff
ENV NODE_ENV=production
ENV VERIFIER_PORT=3010
ENV VERIFIER_HOST=0.0.0.0

# ── Security: non-root user ───────────────────────────────────────────────────
RUN addgroup -S verifier && adduser -S verifier -G verifier
USER verifier

EXPOSE 3010
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
