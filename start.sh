#!/bin/sh
# start.sh — install oasdiff if missing, then start the verifier
set -e

OASDIFF_VERSION="1.35.0"
OASDIFF_PATH="/tmp/oasdiff"

# Install oasdiff if not already present
if [ ! -f "$OASDIFF_PATH" ]; then
  echo "Installing oasdiff ${OASDIFF_VERSION}..."
  ARCH=$(uname -m)
  if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    ARCH_LABEL="arm64"
  else
    ARCH_LABEL="amd64"
  fi
  URL="https://github.com/tufin/oasdiff/releases/download/v${OASDIFF_VERSION}/oasdiff_${OASDIFF_VERSION}_linux_${ARCH_LABEL}.tar.gz"
  curl -sSL "$URL" -o /tmp/oasdiff.tar.gz
  tar -xzf /tmp/oasdiff.tar.gz -C /tmp oasdiff
  chmod +x "$OASDIFF_PATH"
  rm -f /tmp/oasdiff.tar.gz
  echo "oasdiff installed: $($OASDIFF_PATH --version)"
else
  echo "oasdiff already present: $($OASDIFF_PATH --version)"
fi

# Export so the Node process can find it
export OASDIFF_BINARY="$OASDIFF_PATH"

# Start the verifier
exec node --import tsx/esm src/server.ts
