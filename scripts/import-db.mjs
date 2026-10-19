// API (D1) -> js/data.js import (admin-feltoltesek atvezetese a repoba)
// Hasznalat: node scripts/import-db.mjs [--force]
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const API = "https://beszoptak-api.ferkomes.workers.dev/api/adat";
const GYOKER = fileURLToPath(new URL("../", import.meta.url));
const CEL = fileURLToPath(new URL("../js/data.js", import.meta.url));

// Biztonsagi halo: nem irja felul a helyi, nem commitolt data.js valtoztatasokat.
if (!process.argv.includes("--force")) {
  try {
    const status = execSync("git status --porcelain -- js/data.js", { cwd: GYOKER, encoding: "utf8" });
    if (status.trim()) {
      console.error("LEALLITVA: a js/data.js helyben modositott. Elobb commitold/vedd el,");
      console.error("vagy ha biztos vagy benne: node scripts/import-db.mjs --force");
      process.exit(1);
    }
  } catch (e) {
    if (e.status !== undefined && !String(e.stdout || "").includes("js/data.js")) throw e;
  }
}

const res = await fetch(API);
if (!res.ok) throw new Error("API HTTP " + res.status);
const adat = await res.json();
if (!adat || !Array.isArray(adat.bejegyzesek)) throw new Error("hibas API valasz");

const base = new URL(API).origin + "/kepek/";
const vissza = (k) => (typeof k === "string" && k.startsWith(base) ? "images/" + k.slice(base.length) : k);

adat.bejegyzesek.forEach((b) => {
  b.kepek = (b.kepek || []).map(vissza);
  (b.kapcsolatok || []).forEach((k) => {
    k.kepek = (k.kepek || []).map(vissza);
  });
});

const obj = { forras: adat.forras, frissitve: adat.frissitve, bejegyzesek: adat.bejegyzesek };

const szoveg =
  "// Beszoptak.hu - kategorizált szereplők adatai\n" +
  "// Forrás: D1 adatbázis (node scripts/import-db.mjs) – sync.sh ezt exportálja vissza D1-be.\n" +
  "// Admin feltöltés: admin.html (R2 + D1), a kép feltöltés után futtasd: node scripts/import-db.mjs\n" +
  '// kategoria: "sitt" | "elozetes" | "felkeszul" | "tanu" | "kapta" | "visszafizetes"\n' +
  '// fokategoria: "maganszemely" | "kozeleti" | "ceg"\n' +
  "const ADATOK = " + JSON.stringify(obj, null, 2) + ";\n\n" +
  "const KATEGORIAK = " + JSON.stringify(adat.kategoriak, null, 2) + ";\n\n" +
  "const FOKATEGORIAK = " + JSON.stringify(adat.fokategoriak, null, 2) + ";\n";

fs.writeFileSync(CEL, szoveg);
console.log("OK: " + adat.bejegyzesek.length + " bejegyzes -> js/data.js");
