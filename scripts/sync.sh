#!/bin/bash
# Adatszinkron: js/data.js -> D1 + images/ -> R2
# Futtatas: ./scripts/sync.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Admin (admin.html) feltoltesek atvezetese, csak ha a data.js tiszta (nem lokal modositas).
if [ -z "$(git status --porcelain -- js/data.js 2>/dev/null)" ]; then
  echo "== Import API -> js/data.js (admin-feltoltesek) =="
  node scripts/import-db.mjs || echo "   (import kihagyva: API nem elerheto)"
else
  echo "== Import kihagyva: a data.js helyben modositott =="
echo "   Figyelem: ha admin feltoltottet azota, ez a lepes felulirhatja. Futas elott: node scripts/import-db.mjs"
fi

echo "== Export data.js -> SQL =="
node scripts/export-db.mjs > worker/data.sql

echo "== D1 feltoltes (remote) =="
npx --yes wrangler d1 execute beszoptak_db --remote --file worker/data.sql >/dev/null

echo "== R2 kepfeltoltes (remote) =="
cd images
for f in *; do
  npx --yes wrangler r2 object put "beszoptak-images/$f" --file "$f" --content-type image/jpeg --remote >/dev/null 2>&1
done
cd ..

echo "== Worker deploy (ha valtozott) =="
(cd worker && npx --yes wrangler deploy >/dev/null 2>&1) || true

echo "Kesz. API: https://beszoptak-api.ferkomes.workers.dev/api/adat"
