#!/bin/sh
set -eu
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Install Node.js 22.13+ and npm, then run ./start.sh again."; exit 1; }
exec node scripts/start.mjs "$@"
