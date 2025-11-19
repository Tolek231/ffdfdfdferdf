#!/usr/bin/env bash
set -euo pipefail
URL="${1:-http://localhost:3000/health}"
echo "GET $URL"
curl -sS "$URL" | jq . || curl -sS "$URL"
