// data.js -> D1 import SQL generalo (node scripts/export-db.mjs > worker/data.sql)
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../js/data.js", import.meta.url), "utf8") +
  ";globalThis.__X={ADATOK,KATEGORIAK,FOKATEGORIAK};";
const ctx = vm.createContext({});
vm.runInContext(src, ctx);
const { ADATOK, KATEGORIAK, FOKATEGORIAK } = ctx.__X;

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const rows = [];

ADATOK.bejegyzesek.forEach((b, i) => {
  rows.push(`INSERT OR REPLACE INTO bejegyzesek (id, sorrend, adat) VALUES (${q(b.id)}, ${i}, ${q(JSON.stringify(b))});`);
});

const meta = {
  kategoriak: JSON.stringify(KATEGORIAK),
  fokategoriak: JSON.stringify(FOKATEGORIAK),
  forras: ADATOK.forras || "",
  frissitve: ADATOK.frissitve || "",
};
for (const [k, v] of Object.entries(meta)) {
  rows.push(`INSERT OR REPLACE INTO meta (kulcs, ertek) VALUES (${q(k)}, ${q(v)});`);
}

console.log(rows.join("\n"));
console.error(`OK: ${ADATOK.bejegyzesek.length} bejegyzes + ${Object.keys(meta).length} meta sor`);
