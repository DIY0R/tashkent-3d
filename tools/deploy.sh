#!/bin/bash
# Build into dist-next, precompress, then swap into dist atomically and (re)start pm2 process.
set -e
exec 9>/tmp/tashkent-deploy.lock; flock 9
cd "$(dirname "$0")/.."
rm -rf dist-next
npx vite build --outDir dist-next --emptyOutDir --logLevel warn
ROOT_OVERRIDE=dist-next node tools/compress.mjs
rm -rf dist-old; [ -d dist ] && mv dist dist-old; mv dist-next dist; rm -rf dist-old
if pm2 describe tashkent-3d >/dev/null 2>&1; then pm2 restart tashkent-3d --update-env >/dev/null; else PORT=8090 pm2 start server/serve.mjs --name tashkent-3d >/dev/null; fi
sleep 1; curl -s -o /dev/null -w "deployed: HTTP %{http_code}\n" http://127.0.0.1:8090/
