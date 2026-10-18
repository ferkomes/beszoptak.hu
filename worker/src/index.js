// beszoptak.hu – API (D1) + képek (R2)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
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

    if (url.pathname === "/") {
      return new Response(
        "beszoptak.hu API – /api/adat · /kepek/<fajl>",
        { headers: CORS }
      );
    }

    return new Response("Nincs ilyen útvonal", { status: 404, headers: CORS });
  },
};
