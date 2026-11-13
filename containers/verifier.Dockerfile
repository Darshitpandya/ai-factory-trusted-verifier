# ── Stage 1: copy pre-built oasdiff binary from official image ───────────────
# Works on amd64 and arm64 — no curl/download needed
FROM tufin/oasdiff:latest AS oasdiff-bin

# ── Stage 2: Node.js runtime ───────────────────────────────────────────────────
FROM node:22-alpine

# Copy oasdiff binary from stage 1
COPY --from=oasdiff-bin /bin/oasdiff /usr/local/bin/oasdiff
RUN chmod +x /usr/local/bin/oasdiff && oasdiff --version

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app
COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src/ ./src/
COPY policies/ ./policies/

# Environment
ENV OASDIFF_BINARY=/usr/local/bin/oasdiff
ENV NODE_ENV=production
ENV VERIFIER_PORT=3010
ENV VERIFIER_HOST=0.0.0.0

# Non-root
RUN addgroup -S verifier && adduser -S verifier -G verifier
USER verifier

EXPOSE 3010

# Use sh start.sh so env vars in .env are loaded
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
