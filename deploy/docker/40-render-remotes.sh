#!/bin/sh
# Renders the runtime remote registry from environment variables at container
# start: promoting an image between environments never requires a rebuild,
# and a remote can be repointed (or rolled back) by changing one variable.
set -eu
target=/usr/share/nginx/html/config/remotes.json
mkdir -p "$(dirname "$target")"
cat > "$target" <<JSON
{
  "environment": "${ENVIRONMENT:-production}",
  "remotes": {
    "portfolio": { "entry": "${PORTFOLIO_URL}/mf-manifest.json" },
    "trading": { "entry": "${TRADING_URL}/mf-manifest.json" },
    "compliance": { "entry": "${COMPLIANCE_URL}/mf-manifest.json" },
    "blotter": { "entry": "${BLOTTER_URL}/mf-manifest.json" }
  }
}
JSON
echo "remotes.json rendered (${ENVIRONMENT:-production}) for portfolio=${PORTFOLIO_URL} trading=${TRADING_URL} compliance=${COMPLIANCE_URL} blotter=${BLOTTER_URL}"
