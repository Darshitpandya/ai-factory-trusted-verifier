FROM node:22-alpine AS base

# Install oasdiff at a pinned version — digest-pinned in production
# Replace OASDIFF_VERSION with the specific version you want to pin
ARG OASDIFF_VERSION=1.10.14
RUN apk add --no-cache curl && \
    curl -sSL "https://github.com/tufin/oasdiff/releases/download/v${OASDIFF_VERSION}/oasdiff_${OASDIFF_VERSION}_linux_amd64.tar.gz" \
    -o /tmp/oasdiff.tar.gz && \
    tar -xzf /tmp/oasdiff.tar.gz -C /usr/local/bin oasdiff && \
    chmod +x /usr/local/bin/oasdiff && \
    rm /tmp/oasdiff.tar.gz && \
    apk del curl

RUN npm install -g pnpm@9

WORKDIR /app
COPY package.json ./
COPY tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src/ ./src/
COPY policies/ ./policies/

ENV OASDIFF_BINARY=/usr/local/bin/oasdiff
ENV NODE_ENV=production

# Never run as root
RUN addgroup -S verifier && adduser -S verifier -G verifier
USER verifier

EXPOSE 3002
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
