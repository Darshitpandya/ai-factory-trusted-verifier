# ── Stage 1: download oasdiff for the right architecture ─────────────────────
FROM alpine:3.20 AS oasdiff-download
ARG OASDIFF_VERSION=1.35.0
RUN apk add --no-cache curl ca-certificates tar && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then GOARCH="arm64"; else GOARCH="amd64"; fi && \
    echo "Downloading oasdiff ${OASDIFF_VERSION} for linux/${GOARCH}..." && \
    curl -sSL "https://github.com/tufin/oasdiff/releases/download/v${OASDIFF_VERSION}/oasdiff_${OASDIFF_VERSION}_linux_${GOARCH}.tar.gz" \
         -o /tmp/oasdiff.tar.gz && \
    tar -xzf /tmp/oasdiff.tar.gz -C /usr/local/bin oasdiff && \
    chmod +x /usr/local/bin/oasdiff && \
    /usr/local/bin/oasdiff --version

# ── Stage 2: Node.js runtime ───────────────────────────────────────────────────
FROM node:22-alpine

# Copy verified oasdiff binary
COPY --from=oasdiff-download /usr/local/bin/oasdiff /usr/local/bin/oasdiff

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app
COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src/ ./src/
COPY policies/ ./policies/

ENV OASDIFF_BINARY=/usr/local/bin/oasdiff
ENV NODE_ENV=production
ENV VERIFIER_HOST=0.0.0.0

RUN addgroup -S verifier && adduser -S verifier -G verifier
USER verifier

CMD ["node", "--import", "tsx/esm", "src/server.ts"]
