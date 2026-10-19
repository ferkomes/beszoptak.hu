// beszoptak.hu – API (D1) + képek (R2)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function tokenOk(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const fejlec = request.headers.get("Authorization") || "";
  const token = fejlec.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === env.ADMIN_TOKEN;
}

function base64Bytes(b64) {
  const bin = atob(b64);
  const bajtok = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bajtok[i] = bin.charCodeAt(i);
  return bajtok;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname === "/api/adat") {
      try {
        const bej = await env.BESZOPTAK_DB.prepare(
          "SELECT sorrend, adat FROM bejegyzesek ORDER BY sorrend"
        ).all();
        const meta = await env.BESZOPTAK_DB.prepare("SELECT kulcs, ertek FROM meta").all();

        const kulcsok = Object.fromEntries(meta.results.map((r) => [r.kulcs, r.ertek]));
        const base = url.origin;

        const bejegyzesek = bej.results.map((r) => {
          const b = JSON.parse(r.adat);
          const utvonal = (kepek) =>
            (kepek || []).map((k) => (/^https?:\/\//.test(k) ? k : base + "/kepek/" + k.replace(/^images\//, "")));
          b.kepek = utvonal(b.kepek);
          (b.kapcsolatok || []).forEach((k) => { k.kepek = utvonal(k.kepek); });
          return b;
        });

        return json({
          forras: kulcsok.forras || "",
          frissitve: kulcsok.frissitve || "",
          bejegyzesek,
          kategoriak: JSON.parse(kulcsok.kategoriak || "{}"),
          fokategoriak: JSON.parse(kulcsok.fokategoriak || "{}"),
        });
      } catch (e) {
        return json({ hiba: String(e) }, 500);
      }
    }

    if (url.pathname.startsWith("/kepek/")) {
      const kulcs = url.pathname.slice("/kepek/".length);
      if (!/^[A-Za-z0-9._-]+$/.test(kulcs)) return new Response("Rossz útvonal", { status: 400 });
      const obj = await env.BESZOPTAK_IMAGES.get(kulcs);
      if (!obj) return new Response("Nincs ilyen kép", { status: 404 });
      const fejlec = {
        "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        ...CORS,
      };
      return new Response(obj.body, { headers: fejlec });
    }

    if (url.pathname === "/api/admin/kep" && request.method === "POST") {
      if (!tokenOk(request, env)) return json({ hiba: "érvénytelen admin token" }, 401);
      let törzs;
      try {
        törzs = await request.json();
      } catch (e) {
        return json({ hiba: "hibás JSON" }, 400);
      }
      const fajlok = törzs && Array.isArray(törzs.fajlok) ? törzs.fajlok : [];
      if (!fajlok.length || fajlok.length > 4) return json({ hiba: "1–4 fájl szükséges" }, 400);
      const feltoltott = [];
      for (const f of fajlok) {
        if (!f || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(f.nev || "")) return json({ hiba: "rossz fájlnév" }, 400);
        if (typeof f.base64 !== "string" || f.base64.length > 4000000) return json({ hiba: "rossz vagy túl nagy tartalom" }, 400);
        let bajtok;
        try {
          bajtok = base64Bytes(f.base64);
        } catch (e) {
          return json({ hiba: "érvénytelen base64: " + f.nev }, 400);
        }
        await env.BESZOPTAK_IMAGES.put(f.nev, bajtok, {
          httpMetadata: { contentType: f.tipus || "image/jpeg" },
        });
        feltoltott.push(f.nev);
      }
      return json({ ok: true, feltoltott });
    }

    if (url.pathname === "/api/admin/frissit" && request.method === "POST") {
      if (!tokenOk(request, env)) return json({ hiba: "érvénytelen admin token" }, 401);
      let törzs;
      try {
        törzs = await request.json();
      } catch (e) {
        return json({ hiba: "hibás JSON" }, 400);
      }
      const { id, slot, kepek } = törzs || {};
      if (!id || typeof id !== "string") return json({ hiba: "hiányzó id" }, 400);
      if (!Array.isArray(kepek) || kepek.length > 2) return json({ hiba: "kepek nem tömb" }, 400);
      for (const k of kepek) {
        if (typeof k !== "string" || !/^images\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(k)) {
          return json({ hiba: "rossz képutvonal: " + k }, 400);
        }
      }
      const sor = await env.BESZOPTAK_DB.prepare(
        "SELECT sorrend, adat FROM bejegyzesek WHERE id = ?"
      ).bind(id).first();
      if (!sor) return json({ hiba: "nincs ilyen bejegyzés: " + id }, 404);
      let b;
      try {
        b = JSON.parse(sor.adat);
      } catch (e) {
        return json({ hiba: "sorok olvasási hiba" }, 500);
      }
      if (slot === "kartya") {
        b.kepek = kepek;
      } else if (slot && slot.startsWith("kapcsolat:")) {
        const idx = parseInt(slot.slice("kapcsolat:".length), 10);
        if (!b.kapcsolatok || !(idx >= 0 && idx < b.kapcsolatok.length)) {
          return json({ hiba: "rossz kapcsolat index" }, 400);
        }
        b.kapcsolatok[idx].kepek = kepek;
      } else {
        return json({ hiba: "rossz slot" }, 400);
      }
      await env.BESZOPTAK_DB.prepare(
        "INSERT OR REPLACE INTO bejegyzesek (id, sorrend, adat) VALUES (?, ?, ?)"
      ).bind(id, sor.sorrend, JSON.stringify(b)).run();
      return json({ ok: true, id, slot, kepek });
    }

    if (url.pathname === "/api/adat/frissit" && request.method === "POST") {
      if (!tokenOk(request, env)) return json({ hiba: "érvénytelen admin token" }, 401);
      let törzs;
      try {
        törzs = await request.json();
      } catch (e) {
        return json({ hiba: "hibás JSON" }, 400);
      }
      const { id, adat } = törzs || {};
      if (!id || typeof id !== "string") return json({ hiba: "hiányzó id" }, 400);
      if (!adat || typeof adat !== "object" || Array.isArray(adat)) return json({ hiba: "adat nem objektum" }, 400);
      if (typeof adat.nev !== "string" || !adat.nev.trim()) return json({ hiba: "kötelező mező: név" }, 400);
      const sor = await env.BESZOPTAK_DB.prepare(
        "SELECT sorrend FROM bejegyzesek WHERE id = ?"
      ).bind(id).first();
      if (!sor) return json({ hiba: "nincs ilyen bejegyzés: " + id }, 404);
      adat.id = id;
      const szoveg = JSON.stringify(adat);
      if (szoveg.length > 200000) return json({ hiba: "túl nagy adat" }, 400);
      await env.BESZOPTAK_DB.prepare(
        "INSERT OR REPLACE INTO bejegyzesek (id, sorrend, adat) VALUES (?, ?, ?)"
      ).bind(id, sor.sorrend, szoveg).run();
      return json({ ok: true, id });
    }

    if (url.pathname === "/") {
      return new Response(
        "beszoptak.hu API – /api/adat · /kepek/<fajl>",
        { headers: CORS }
      );
    }

    return new Response("Nincs ilyen útvonal", { status: 404, headers: CORS });
  },
};
