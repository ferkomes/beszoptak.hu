// koszpenz — Közpénz- és Támogatási Térkép (Cloudflare Worker, egy fájl).
//
// ARCHITEKTÚRA (46 ezer sorhoz méretezve):
//   - Nyers adatok darabolva KV-ban: koszpenz_ev_{YYYY}, koszpenz_tel_{nev}
//   - Aggregátumok külön kulcsokban: agg_towns, agg_winners, agg_monthly,
//     agg_index (cég->települések), agg_top (top 200 projekt), agg_meta,
//     agg_townmonths (település×hónap mátrix a timeline-hoz)
//   - A frontend AGGREGÁTUMBÓL rajzol (térkép, rangsorok, diagramok),
//     részleteket (település/cég/személy projektjei) kérésre tölt le.
//   - Így a teljes 46 ezres állomány böngészhető anélkül, hogy egyszerre
//     kellene letölteni.
//
// Végpontok:
//   GET  /                  -> frontend
//   GET  /api/stats         -> áttekintés (totálok, hónapok, megyék)
//   GET  /api/agg/towns     -> település-összesítések (térkép)
//   GET  /api/winners       -> nyertes-rangsor (top 2000)
//   GET  /api/monthly       -> havi összesítések (diagram)
//   GET  /api/top           -> top 200 projekt (kezdő lista)
//   GET  /api/townmonths    -> település×hónap mátrix (timeline)
//   GET  /api/settlement?name= -> egy település összes projektje
//   GET  /api/company?name=    -> egy cég összes projektje
//   GET  /api/people        -> személyek (GET nyitott)
//   POST /api/people        -> személyek bővítése (ADMIN_KEY kell)
//   GET  /api/bounds        -> településhatárok GeoJSON (KV, hosszú cache)
//   POST /api/update        -> EGY projekt hozzáfűzése (ADMIN_KEY kell;
//                             tömegeshez offline szkript + aggregátum-újraépítés)

const KV_DATA_KEY = 'kosszpenz_data_v1';
const KV_BOUNDS_KEY = 'kosszpenz_bounds_v1';
const KV_PEOPLE_KEY = 'kosszpenz_people_v1';

// --- Beépített MINTA (ha a KV üres: helyi fejlesztéshez) ---
const FALLBACK_PROJECTS = [
  { id: 'bp-metro-2026', city: 'Budapest', settlement: 'Budapest', title: 'M3-as metróvonal felújítása, III. ütem', lat: 47.4979, lng: 19.0402, amount_huf: 125000000000, type: 'eu', date: '2026-03-15', winner: 'Minta Kivitelező Kft.', url: '' },
  { id: 'deb-egyetem-2026', city: 'Hajdú-Bihar', settlement: 'Debrecen', title: 'Debreceni Egyetem kutatóközpont', lat: 47.5533, lng: 21.6273, amount_huf: 42000000000, type: 'eu', date: '2026-01-20', winner: 'Campus Építő Minta Kft.', url: '' },
];

// Nagytelepülések lakossága (kb.) az egy főre mutatóhoz.
const TOWN_POP = {
  'Budapest': 1686000, 'Debrecen': 199000, 'Szeged': 157000, 'Miskolc': 143000,
  'Pécs': 137000, 'Győr': 127000, 'Nyíregyháza': 114000, 'Kecskemét': 109000,
  'Székesfehérvár': 95000, 'Szombathely': 77000, 'Szolnok': 70000, 'Tatabánya': 66000,
  'Sopron': 62000, 'Kaposvár': 60000, 'Békéscsaba': 59000, 'Veszprém': 56000,
  'Zalaegerszeg': 56000, 'Eger': 51000, 'Nagykanizsa': 44000, 'Dunaújváros': 41000,
  'Hódmezővásárhely': 41000, 'Baja': 34000, 'Cegléd': 34000, 'Mosonmagyaróvár': 33000,
  'Vác': 32000, 'Gödöllő': 32000, 'Salgótarján': 32000, 'Ózd': 31000,
  'Szekszárd': 30000, 'Pápa': 30000, 'Hajdúböszörmény': 30000, 'Kiskunfélegyháza': 29000,
  'Gyula': 28000, 'Esztergom': 28000, 'Kiskunhalas': 27000, 'Ajka': 27000,
  'Szentes': 26000, 'Jászberény': 26000, 'Orosháza': 26000, 'Kazincbarcika': 26000,
  'Siófok': 25000, 'Tata': 24000, 'Hatvan': 20000, 'Komárom': 19000,
  'Paks': 18000, 'Dombóvár': 18000, 'Mohács': 17000, 'Mezőkövesd': 16000,
  'Tiszaújváros': 15000, 'Sárvár': 15000, 'Sátoraljaújhely': 14000
};

function coordOk(v) {
  return v === undefined || v === null || v === '' || Number.isFinite(Number(v));
}
function validProject(p) {
  return p && typeof p.id === 'string' && p.id.length > 0
    && typeof p.city === 'string' && typeof p.title === 'string'
    && coordOk(p.lat) && coordOk(p.lng)
    && Number.isFinite(Number(p.amount_huf))
    && (p.type === 'eu' || p.type === 'hazai')
    && typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date)
    && typeof p.winner === 'string';
}
// --- Vizsgálat-gráf (/vizsgalat) segédek: névnormalizálás, role-parse, kollektorok ---
function normPersonName(s) {
  try {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  } catch (e) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
}
const HUN_SURNAMES = ['nagy', 'kovacs', 'kovács', 'szabo', 'szabó', 'toth', 'tóth', 'horvath', 'horváth',
  'kiss', 'varga', 'molnar', 'molnár', 'nemeth', 'németh', 'farkas', 'balogh', 'papp', 'takacs', 'takács',
  'juhasz', 'juhász', 'lakatos', 'meszaros', 'mészáros', 'simon', 'racz', 'rácz', 'fekete', 'szalai',
  'hegedus', 'hegedűs', 'feher', 'fehér', 'kerekes', 'pintér', 'pinter', 'vörös', 'voros'];
function parseVizRole(role) {
  let r = String(role || '');
  let flag = false;
  if (/\(ellen[őo]rizend[őo]\)/i.test(r)) {
    flag = true;
    r = r.replace(/\(ellen[őo]rizend[őo]\)/gi, '').trim();
  }
  let from = null, to = null;
  const m = r.match(/\((\d{4})\s*[–-]\s*(\d{4}(?:\.\d{2}\.\d{2})?)?\)/);
  if (m) {
    from = Number(m[1]);
    if (m[2]) to = Number(String(m[2]).slice(0, 4));
  }
  const rl = r.toLowerCase();
  let kind = 'egyéb';
  if (/tulajdonos|részesedés|reszesedes/.test(rl)) kind = 'tulajdon';
  else if (/kurat|felügyel|felugyel|bizottság|bizottsag|testület|testulet/.test(rl)) kind = 'testület';
  else if (/vezérigazgató|vezerigazgato|ügyvezető|ugyvezeto|igazgató|igazgato|rektor|főigazgató|foigazgato|parancsnok|kancellár|kancellar|polgármester|polgarmester|püspök|puspok|érsek|ersek|miniszter|államtitkár|allamtitkar|kormánymegbízott|kormanymegbizott|elnök|elnok/.test(rl)) kind = 'vezetés';
  return { role: r.replace(/\s+/g, ' ').trim(), kind, from, to, flag };
}
function isCollectorCompany(displayName) {
  return /önkormányzat/i.test(displayName || '');
}
async function buildVizsgalatGraph(env, topN) {
  const kv = env.KOSSZPENZ_KV;
  const [winnersR, peopleR, tedWinnersR, euTopR, tedTopR] = await Promise.all([
    kv.get('kosszpenz_agg_winners', 'json').catch(() => null),
    kv.get(KV_PEOPLE_KEY, 'json').catch(() => null),
    kv.get('kosszpenz_agg_ted_winners', 'json').then(r => (r && r.winners) || (Array.isArray(r) ? r : [])).catch(() => []),
    kv.get('kosszpenz_agg_top', 'json').then(r => (Array.isArray(r) ? r : ((r && r.projects) || []))).catch(() => []),
    kv.get('kosszpenz_agg_ted_top', 'json').then(r => (Array.isArray(r) ? r : ((r && r.projects) || []))).catch(() => [])
  ]);
  const winners = Array.isArray(winnersR) ? winnersR : [];
  const people = (peopleR && peopleR.people) || [];
  const top = winners.slice().sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, topN);
  const nodes = [], edges = [];
  const byCoKey = {}, byPeKey = {}, winByKey = {}, tedByKey = {};
  winners.forEach(w => { winByKey[normCompanyKey(w.name)] = w; });
  (Array.isArray(tedWinnersR) ? tedWinnersR : []).forEach(w => { tedByKey[normCompanyKey(w.name)] = w; });
  const addCompany = (display, fromTop) => {
    const key = normCompanyKey(display);
    if (byCoKey[key]) return byCoKey[key];
    const w = winByKey[key] || tedByKey[key];
    const nd = {
      id: 'c:' + key,
      type: isCollectorCompany(display) ? 'collector' : 'company',
      label: (w && w.name) || String(display || '').trim(),
      totalHuf: (w && w.total) || null,
      projectCount: (w && w.count) || null,
      extended: !fromTop
    };
    nodes.push(nd);
    byCoKey[key] = nd;
    return nd;
  };
  top.forEach(w => addCompany(w.name, true));
  const seenEdge = new Set();
  let dupSkipped = 0;
  const unmatched = new Set();
  people.forEach(pp => {
    const cname = String(pp.company || '');
    const ckey = normCompanyKey(cname);
    if (!winByKey[ckey] && !tedByKey[ckey]) unmatched.add(cname);
    const co = addCompany(cname, false);
    const pkey = normPersonName(pp.name);
    let pe = byPeKey[pkey];
    if (!pe) {
      pe = {
        id: 'p:' + pkey,
        type: pkey === 'magyar allam' ? 'collector' : 'person',
        label: String(pp.name || '').trim()
      };
      nodes.push(pe);
      byPeKey[pkey] = pe;
    } else if (String(pp.name || '').trim().length > pe.label.length) {
      pe.label = String(pp.name || '').trim();
    }
    const pr = parseVizRole(pp.role);
    const ek = pkey + '|' + ckey + '|' + pr.role;
    if (seenEdge.has(ek)) { dupSkipped++; return; }
    seenEdge.add(ek);
    edges.push({
      source: pe.id, target: co.id, kind: pr.kind, role: pr.role,
      share: String(pp.share || ''), from: pr.from, to: pr.to,
      src: String(pp.source || ''), flag: pr.flag
    });
  });
  const coCount = {};
  people.forEach(pp => {
    const k = normPersonName(pp.name);
    coCount[k] = coCount[k] || {};
    coCount[k][normCompanyKey(pp.company)] = 1;
  });
  const collisions = Object.keys(coCount).filter(k => {
    const surname = k.split(' ')[0];
    return Object.keys(coCount[k]).length > 1 && HUN_SURNAMES.indexOf(surname) >= 0;
  }).map(k => ({
    name: (byPeKey[k] && byPeKey[k].label) || k,
    companies: Object.keys(coCount[k]).length
  }));
  const pickProj = (p, source) => ({
    title: String(p.title || '').slice(0, 90),
    amount_huf: Number(p.amount_huf || 0),
    date: String(p.date || ''),
    winner: String(p.winner || ''),
    settlement: String(p.settlement || p.town || p.city || ''),
    source
  });
  const euTop = (Array.isArray(euTopR) ? euTopR : []).map(p => pickProj(expandTopProject(p), 'eu'))
    .filter(p => p.title && p.amount_huf > 0)
    .sort((a, b) => b.amount_huf - a.amount_huf).slice(0, 8);
  const tedTop = (Array.isArray(tedTopR) ? tedTopR : []).map(p => pickProj(p, 'ted'))
    .filter(p => p.title && p.amount_huf > 0)
    .sort((a, b) => b.amount_huf - a.amount_huf).slice(0, 8);
  const topProjects = euTop.concat(tedTop);
  return {
    nodes, edges,
    projects: topProjects,
    meta: {
      built_at: new Date().toISOString(), topN,
      companies: Object.keys(byCoKey).length, tedCompanies: Object.keys(tedByKey).length,
      persons: Object.keys(byPeKey).length,
      edges: edges.length, dupEdgesSkipped: dupSkipped,
      unmatchedCompanies: [...unmatched].slice(0, 50),
      collisions
    }
  };
}
function normCompanyKey(w) {  return String(w || '').toUpperCase().replace(/\s+/g, ' ')
    .replace(/\b(KFT|ZRT|BT|KKT|NYRT)\.?/g, '$1').replace(/[.\s]+$/, '').trim();
}
// A top-200 aggregátum helytakarékos, rövid kulcsokkal tárolódik
// ({t,a,d,w,s,x,y}); a frontend hosszú kulcsokat vár, ezért az API-határon
// kibontjuk. Már hosszú sorokat változatlanul átenged.
function expandTopProject(p) {
  if (!p || typeof p !== 'object') return p;
  if (p.title !== undefined || p.amount_huf !== undefined) return p;
  return {
    title: p.t || 'Névtelen projekt',
    amount_huf: p.a || 0,
    date: p.d || '',
    winner: p.w || '',
    settlement: p.s || '',
    city: '',
    lat: (p.x !== undefined ? p.x : null),
    lng: (p.y !== undefined ? p.y : null),
    type: 'eu', fund: '', programme: '', url: ''
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function checkAdmin(request, env) {
  const adminKey = (env && env.ADMIN_KEY) || '';
  if (!adminKey) return true;
  const url = new URL(request.url);
  const given = url.searchParams.get('key') || request.headers.get('X-API-Key') || '';
  return given === adminKey;
}

// --- Frontend ---
// Vizsgálat-oldal (/vizsgalat): forenszikus fokozatos háló külön lapon,
// saját témákkal, konfigurálható küszöbökkel, útkeresővel.
const VIZ_START_DEFAULT = ['Nemzeti Infrastruktúra Fejlesztő Zrt.',
  'Magyar Fejlesztési Bank',
  'MÁV-START Vasúti Személyszállító Zártkörűen Működő Részvénytársaság',
  'PÉCSI TUDOMÁNYEGYETEM',
  'IKK Innovatív Képzéstámogató Központ Zártkörűen Működő Részvénytársaság'];
function renderVizsgalatHtml() {
  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vizsgálat — kik állnak a közpénz-nyertesek mögött</title>
<style>
  :root, body[data-vt="dark"] {
    --vbg: #0b1220; --vcard: #111c33; --vline: #1e293b; --vtxt: #e2e8f0; --vmut: #94a3b8;
    --vacc: #38bdf8; --vper: #f6a94f; --vcol: #64748b; --vgold: #f5c542; --vteal: #2dd4bf;
    --vpur: #c084fc; --vproj: #fb923c; --vety: #64748b; --vchip: #1e293b; --vlink: #7dd3fc;
    --vown: #4ade80;
  }
  body[data-vt="light"] {
    --vbg: #f1f5f9; --vcard: #ffffff; --vline: #cbd5e1; --vtxt: #0f172a; --vmut: #64748b;
    --vacc: #0284c7; --vper: #f28c28; --vcol: #94a3b8; --vgold: #a16207; --vteal: #0f766e;
    --vpur: #7e22ce; --vproj: #c2410c; --vety: #94a3b8; --vchip: #e2e8f0; --vlink: #0369a1;
    --vown: #15803d;
  }
  @media (prefers-color-scheme: light) {
    body:not([data-vt]) {
      --vbg: #f1f5f9; --vcard: #ffffff; --vline: #cbd5e1; --vtxt: #0f172a; --vmut: #64748b;
      --vacc: #0284c7; --vper: #f28c28; --vcol: #94a3b8; --vgold: #a16207; --vteal: #0f766e;
      --vpur: #7e22ce; --vproj: #c2410c; --vety: #94a3b8; --vchip: #e2e8f0; --vlink: #0369a1;
      --vown: #15803d;
    }
  }
  body { background: var(--vbg); color: var(--vtxt); margin: 0; font-family: system-ui, sans-serif; }
  .vwrap { max-width: 1280px; margin: 0 auto; padding: 12px; }
  .vcard { background: var(--vcard); border: 1px solid var(--vline); border-radius: 12px; padding: 12px; margin-bottom: 12px; }
  .vgrid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
  @media (max-width: 900px) { .vgrid { grid-template-columns: 1fr; } }
  #vg { width: 100%; height: 62vh; min-height: 420px; border: 1px solid var(--vline); border-radius: 12px; background: var(--vbg); }
  .vrow { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
  .vrow label { font-size: 13px; color: var(--vmut); }
  .vrow input[type=number], .vrow input[type=text], .vrow select { background: var(--vbg); color: var(--vtxt); border: 1px solid var(--vline); border-radius: 8px; padding: 4px 8px; font-size: 13px; }
  .vbtn { background: var(--vchip); color: var(--vtxt); border: 1px solid var(--vline); border-radius: 9999px; padding: 5px 12px; font-size: 13px; cursor: pointer; }
  .vbtn:hover, .vbtn.on { background: var(--vacc); color: #0b1220; border-color: var(--vacc); }
  .vbtn:disabled { opacity: 0.45; cursor: not-allowed; }
  a.vlink { color: var(--vlink); }
  #vg [data-vnode] { cursor: pointer; }
  #vg [data-vnode]:hover circle, #vg [data-vnode]:hover rect { stroke: var(--vacc); }
  #vg [data-vnode]:focus { outline: none; }
  #vg [data-vnode]:focus-visible circle, #vg [data-vnode]:focus-visible rect, #vg [data-vnode]:focus-visible use { outline: 2px solid var(--vacc); outline-offset: 2px; }
  #vg text { user-select: none; }
  #vg { touch-action: none; }
  .vlegend { font-size: 12px; color: var(--vmut); }
  .vlegend .sw { display: inline-block; width: 16px; height: 4px; border-radius: 2px; margin: 0 4px 0 10px; vertical-align: middle; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
  #vg .dim { opacity: 0.12; } #vg line.dim { opacity: 0.05; }
  #vg .faint { opacity: 0.45; } #vg line.faint { opacity: 0.2; }
  #vg .ghost { opacity: 0.15; } #vg .ghost text { display: none; }
  #vg line.dash, #vg line.unper { stroke-dasharray: 4 3; }
  #vg [data-vnode]:hover circle, #vg [data-vnode]:hover rect, #vg [data-vnode]:hover use { stroke: var(--vacc); }
  #vtip { display: none; position: fixed; z-index: 2000; max-width: 320px; background: var(--vcard);
    border: 1px solid var(--vacc); color: var(--vtxt); border-radius: 8px; padding: 8px 10px;
    font-size: 13px; pointer-events: none; }
</style>
</head>
<body>
<div class="vwrap">
  <h1 style="margin:4px 0">🔎 Vizsgálat — kik állnak a közpénz-nyertesek mögött</h1>
  <p style="color:var(--vmut);font-size:13px;margin:0 0 10px">Fokozatos felfedezés: kattints a kibontáshoz. <span id="vbuild"></span>
  <button class="vbtn" id="vtheme" style="float:right">🌗 Téma</button></p>
  <div class="vcard">
    <div class="vrow"><b>Kezdőcégek:</b>
      <input type="text" id="vstart" size="60" placeholder="pontos cégnevek vesszővel">
      <button class="vbtn" id="vstartgo">Alkalmaz</button>
    </div>
    <div class="vrow"><b>Kezdőkép:</b>
      <button class="vbtn" data-vmode="company">🏢 Cégek</button>
      <button class="vbtn" data-vmode="person">🧍 Személyek</button>
      <button class="vbtn" data-vmode="project">🪙 Projektek</button>
      <span class="vlegend">csak a választott típus indul — a kapcsolatai egy kattintásra vannak</span>
    </div>
    <div class="vrow">
      <label>Méret alapja: <select id="vsize"><option value="total">elnyert összeg</option><option value="count">projektek száma</option><option value="equal">egyenlő</option></select></label>
      <label>Közös személy min: <input type="number" id="vshared" min="1" max="10" value="1" style="width:52px"></label>
      <label>Híd min. szervezet: <input type="number" id="vbridge" min="2" max="10" value="2" style="width:52px"></label>
      <label>Max új pont: <input type="number" id="vmaxn" min="5" max="100" value="25" style="width:56px"></label>
      <label>Min. összeg (Mrd Ft): <input type="number" id="vminamt" min="0" value="0" style="width:64px"></label>
      <label><input type="checkbox" id="vsrc"> csak forrással</label>
      <label><input type="checkbox" id="vflag"> csak ellenőrizendő</label>
      <label><input type="checkbox" id="vcoll"> gyűjtő-tulajdonosokon át is</label>
      <label><input type="checkbox" id="vbridges"> csak hídszemélyek</label>
      <label>Közös projekt min: <input type="number" value="1" disabled title="nincs konzorciumi adat"> <span style="font-size:12px;color:var(--vmut)">nincs konzorciumi adat</span></label>
    </div>
    <div class="vrow">
      <button class="vbtn" id="vprojall">🪙 Projektek: BE/KI (összes láthatón)</button>
      <label>Év: <select id="vyear"><option value="">kikapcsolva</option></select></label>
      <input type="text" id="vsearch" placeholder="🔍 Keresés cég/személy…" size="24">
      <span id="vsearchres"></span>
    </div>
    <div class="vrow">
      <select id="vpatha"></select> → <select id="vpathb"></select>
      <button class="vbtn" id="vpathgo">Útkeresés</button>
      <button class="vbtn" id="vfit">Illesztés</button>
      <button class="vbtn" id="vreset">Alaphelyzet</button>
      <span id="vcounts" class="vlegend"></span>
    </div>
    <div class="vlegend">Kör=cég (méret=pénz) · narancs pont=személy (dupla gyűrű=híd) · érme=projekt ·
    <span class="sw" style="background:var(--vgold)"></span>tulajdon
    <span class="sw" style="background:var(--vacc)"></span>vezetés
    <span class="sw" style="background:var(--vpur)"></span>testület
    <span class="sw" style="background:var(--vteal)"></span>konzorcium
    <span class="sw" style="background:var(--vproj)"></span>projekt
    <span class="sw" style="background:var(--vety)"></span>egyéb · szaggatott=ellenőrizendő</div>
  </div>
  <div class="vgrid">
    <div class="vcard" style="margin:0;position:relative"><svg id="vg" viewBox="0 0 900 620" role="img" aria-label="Kapcsolati háló"></svg>
    <div id="vtip"></div>
    <div id="vmsg" style="font-size:13px;color:var(--vmut);margin-top:6px"></div></div>
    <div class="vcard" style="margin:0"><div id="vpanel"><p style="color:var(--vmut);font-size:13px">Kattints egy pontra a részletekért.</p></div></div>
  </div>
  <p style="font-size:12px;color:var(--vmut)">A jelzések összefüggéseket mutatnak, önmagukban nem bizonyítanak semmit. Adat: EU Kohézió 2014–2020 + kézi cégkutatás forráslinkekkel.</p>
</div>
<script>
/* ===== Vizsgálat kliens 1/2: állapot, betöltés, konfig, téma, layout, rajzmag ===== */
var VIZ_BUILD = '20261007-v40';
var VIZ_START = ['Nemzeti Infrastruktúra Fejlesztő Zrt.',
  'Magyar Fejlesztési Bank',
  'MÁV-START Vasúti Személyszállító Zártkörűen Működő Részvénytársaság',
  'PÉCSI TUDOMÁNYEGYETEM',
  'IKK Innovatív Képzéstámogató Központ Zártkörűen Működő Részvénytársaság'];
var VG = { nodes: {}, edges: [], adj: {}, maxTotal: 1, maxCount: 1, years: [] };
var VV = { shown: {}, sedges: [], expanded: {}, projOf: {}, projCache: {}, hiddenN: {},
  rest: {}, revBy: {}, sel: null, pathA: null, pathB: null, path: null, hidden: {},
  trail: [], pins: {}, pinSeq: 0,
  cfg: { shared: 1, bridgeMin: 2, maxNodes: 25, amountMin: 0, onlySrc: false, onlyFlag: false,
         collectors: false, bridgesOnly: false, projects: false, year: null, sizeMode: 'total',
         startMode: 'company' },
  start: [] };
var VKIND = { 'tulajdon': 'var(--vown)', 'vezetés': 'var(--vacc)', 'testület': 'var(--vpur)',
  'kivitelező': 'var(--vteal)', 'konzorcium': 'var(--vteal)', 'projekt': 'var(--vmut)', 'egyéb': 'var(--vety)' };
var VB0 = '0 0 900 620';
function vEsc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function vFmt(n) {
  n = Number(n || 0);
  if (n >= 1e9) return (n / 1e9).toLocaleString('hu-HU', { maximumFractionDigits: 1 }) + ' Mrd Ft';
  if (n >= 1e6) return Math.round(n / 1e6).toLocaleString('hu-HU') + ' M Ft';
  return Math.round(n).toLocaleString('hu-HU') + ' Ft';
}
function vNormCo(s) {
  return String(s || '').toUpperCase().replace(/\s+/g, ' ')
    .replace(/\b(KFT|ZRT|BT|KKT|NYRT)\.?/g, '$1').replace(/[.\s]+$/, '').trim();
}
async function vLoad() {
  // VIZ_BUILD-paraméter: deployonként új edge-cache kulcs (különben 10 percig régi gráf jönne).
  const d = await fetch('/api/vizsgalat/graph?build=' + encodeURIComponent(VIZ_BUILD)).then(r => r.json());
  if (!d || !d.success) throw new Error('graph betöltés hiba');
  VG.nodes = {}; VG.edges = []; VG.adj = {};
  d.nodes.forEach(n => { VG.nodes[n.id] = n; });
  VG.maxTotal = 1; VG.maxCount = 1;
  Object.keys(VG.nodes).forEach(id => {
    const n = VG.nodes[id];
    if (n.type === 'company' && (n.totalHuf || 0) > VG.maxTotal) VG.maxTotal = n.totalHuf;
    if (n.type === 'company' && (n.projectCount || 0) > VG.maxCount) VG.maxCount = n.projectCount;
  });
  const yrs = {};
  d.edges.forEach(e => {
    VG.edges.push(e);
    (VG.adj[e.source] = VG.adj[e.source] || []).push({ to: e.target, e: e });
    (VG.adj[e.target] = VG.adj[e.target] || []).push({ to: e.source, e: e });
    if (e.from) yrs[e.from] = 1;
    if (e.to) yrs[e.to] = 1;
  });
  VG.years = Object.keys(yrs).map(Number).sort((a, b) => a - b);
  VG.projTop = Array.isArray(d.projects) ? d.projects : [];
}
function vOrgCount(personId) {
  const s = {};
  (VG.adj[personId] || []).forEach(a => { s[a.to] = 1; });
  return Object.keys(s).length;
}
function vReadCfg() {
  const q = {};
  try {
    const sp = new URLSearchParams((typeof location !== 'undefined' && location.search) || '');
    ['start', 'shared', 'bridge', 'maxn', 'minamt', 'src', 'flag', 'coll', 'bridges', 'size', 'year', 'mode'].forEach(k => {
      const v = sp.get(k);
      if (v !== null && v !== '') q[k] = v;
    });
  } catch (e) {}
  let st = {};
  try { st = JSON.parse(localStorage.getItem('vizsgalat-cfg') || '{}'); } catch (e) {}
  const g = k => (q[k] !== undefined ? q[k] : (st[k] !== undefined ? st[k] : undefined));
  const c = VV.cfg;
  if (g('shared') !== undefined) c.shared = Math.max(1, Number(g('shared')) || 1);
  if (g('bridge') !== undefined) c.bridgeMin = Math.max(2, Number(g('bridge')) || 2);
  if (g('maxn') !== undefined) c.maxNodes = Math.min(100, Math.max(5, Number(g('maxn')) || 25));
  if (g('minamt') !== undefined) c.amountMin = Math.max(0, Number(g('minamt')) || 0);
  if (g('src') !== undefined) c.onlySrc = g('src') === '1';
  if (g('flag') !== undefined) c.onlyFlag = g('flag') === '1';
  if (g('coll') !== undefined) c.collectors = g('coll') === '1';
  if (g('bridges') !== undefined) c.bridgesOnly = g('bridges') === '1';
  if (g('size') !== undefined && /^(total|count|equal)$/.test(g('size'))) c.sizeMode = g('size');
  if (g('mode') !== undefined && /^(company|person|project)$/.test(g('mode'))) c.startMode = g('mode');
  if (g('year') !== undefined) c.year = g('year') === '' ? null : Number(g('year'));
  const sraw = q.start !== undefined ? q.start : st.start;
  VV.start = sraw ? String(sraw).split(',').map(s => s.trim()).filter(Boolean) : VIZ_START.slice();
}
function vSaveCfg() {
  const c = VV.cfg;
  const o = { shared: c.shared, bridge: c.bridgeMin, maxn: c.maxNodes, minamt: c.amountMin,
    src: c.src, flag: c.onlyFlag, coll: c.collectors, bridges: c.bridgesOnly, size: c.sizeMode,
    mode: c.startMode,
    year: c.year === null ? '' : c.year, start: VV.start.join(',') };
  const st = {};
  Object.keys(o).forEach(k => { st[k] = (k === 'src' || k === 'flag' || k === 'coll' || k === 'bridges') ? (o[k] ? '1' : '') : o[k]; });
  try { localStorage.setItem('vizsgalat-cfg', JSON.stringify(st)); } catch (e) {}
  try {
    const u = new URL(window.location.href);
    Object.keys(st).forEach(k => {
      if (st[k] === '' || st[k] === undefined) u.searchParams.delete(k);
      else u.searchParams.set(k, st[k]);
    });
    window.history.replaceState(null, '', u.toString());
  } catch (e) {}
}
function vInitTheme() {
  let t = null;
  try { t = localStorage.getItem('vizsgalat-theme'); } catch (e) {}
  if (t === 'light' || t === 'dark') document.body.dataset.vt = t;
  const b = document.getElementById('vtheme');
  if (b) b.addEventListener('click', () => {
    const cur = document.body.dataset.vt ||
      ((window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark');
    const nx = cur === 'light' ? 'dark' : 'light';
    document.body.dataset.vt = nx;
    try { localStorage.setItem('vizsgalat-theme', nx); } catch (e) {}
  });
}
function vCoR(n) {
  if (VV.cfg.sizeMode === 'equal') return 20;
  const t = VV.cfg.sizeMode === 'count'
    ? (n.projectCount || 0) / VG.maxCount
    : (n.totalHuf || 0) / VG.maxTotal;
  return Math.min(36, Math.max(9, 9 + 26 * Math.sqrt(Math.max(0, t))));
}
function vCoinR(a) {
  return Math.min(11, Math.max(7, 7 + (4 * Math.log10((Number(a) || 0) / 1e6 + 1)) / 3));
}
function vFmtShort(n) {
  n = Number(n || 0);
  if (n >= 1e9) return Math.round(n / 1e9) + ' Mrd';
  if (n >= 1e6) return Math.round(n / 1e6) + ' M';
  return Math.round(n).toLocaleString('hu-HU') + ' Ft';
}
function vLayout(nodes, epairs, iters) {
  const n = nodes.length;
  if (!n) return;
  iters = iters || Math.min(200, 60 + n * 3);
  const dx = [], dy = [];
  for (let i = 0; i < n; i++) { dx.push(0); dy.push(0); }
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) { dx[i] = 0; dy[i] = 0; }
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        const R = (a.r + b.r) * 0.5 + 44;
        let ddx = a.x - b.x, ddy = a.y - b.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= R * R) continue;
        let d = Math.sqrt(d2);
        if (d < 0.5) {
          ddx = ((i * 37 + j * 11) % 10) - 5; ddy = ((i * 13 + j * 29) % 10) - 5;
          d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        }
        const f = (R - d) * 0.08;
        dx[i] += ddx / d * f; dy[i] += ddy / d * f;
        dx[j] -= ddx / d * f; dy[j] -= ddy / d * f;
      }
    }
    for (let k = 0; k < epairs.length; k++) {
      const a = nodes[epairs[k][0]], b = nodes[epairs[k][1]];
      const ddx = b.x - a.x, ddy = b.y - a.y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.5;
      // Link-távolság = a két végpont sugarának összege + 40 px.
      const L = (a.r || 12) + (b.r || 12) + 40;
      const f = (d - L) * 0.02;
      dx[epairs[k][0]] += ddx / d * f; dy[epairs[k][0]] += ddy / d * f;
      dx[epairs[k][1]] -= ddx / d * f; dy[epairs[k][1]] -= ddy / d * f;
    }
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      if (nd.fx !== null && nd.fx !== undefined) { nd.x = nd.fx; nd.y = nd.fy; dx[i] = 0; dy[i] = 0; continue; }
      dx[i] += (450 - nd.x) * 0.0015; dy[i] += (310 - nd.y) * 0.0015;
      let mx = dx[i], my = dy[i];
      const ml = Math.sqrt(mx * mx + my * my);
      if (ml > 16) { mx = mx / ml * 16; my = my / ml * 16; }
      nd.x = Math.min(876, Math.max(24, nd.x + mx));
      nd.y = Math.min(596, Math.max(24, nd.y + my));
    }
  }
}
function vNodeByLabel(label) {
  const l = String(label || '').toLowerCase();
  const keys = Object.keys(VG.nodes);
  for (let i = 0; i < keys.length; i++) {
    if (VG.nodes[keys[i]].label.toLowerCase() === l) return VG.nodes[keys[i]];
  }
  return null;
}
/*VIZSGALAT_JS_2*/
/* ===== Vizsgálat kliens 2/2: felfedezés, panelek, interakciók ===== */
function vNeighbors(id) {
  const out = [];
  (VG.adj[id] || []).forEach(a => { out.push(a.to); });
  return out;
}
function vEdgeW(e) {
  if (e.kind === 'projekt') {
    const a = ((e.amountHuf) || 0);
    return Math.min(2.5, 0.8 + 1.7 * Math.log10(a / 1e6 + 1) / Math.log10(3e5));
  }
  return 1;
}
function vIsBridge(personId) {
  return vOrgCount(personId) >= VV.cfg.bridgeMin;
}
function vExpand(id, rest) {
  const n = VG.nodes[id];
  if (!n) return 0;
  const cands = [];
  (VG.adj[id] || []).forEach(a => {
    const nid = a.to;
    if (VV.shown[nid] || VV.hidden[nid] || nid === id) return;
    const nn = VG.nodes[nid];
    if (!nn || nn.type === 'project') return;
    cands.push({ id: nid, n: nn, e: a.e });
  });
  cands.sort((a, b) => {
    const ta = (a.n.type === 'company' || a.n.type === 'collector') ? (a.n.totalHuf || 0) : 0;
    const tb = (b.n.type === 'company' || b.n.type === 'collector') ? (b.n.totalHuf || 0) : 0;
    if (tb !== ta) return tb - ta;
    if (a.n.type !== b.n.type) return a.n.type === 'person' ? -1 : 1;
    return vOrgCount(b.id) - vOrgCount(a.id);
  });
  const batch = rest ? cands : cands.slice(0, VV.cfg.maxNodes);
  const px = VV.shown[id] ? VV.shown[id].x : 450, py = VV.shown[id] ? VV.shown[id].y : 310;
  batch.forEach((c, i) => {
    // Egyenletes gyűrű: fix szögek, növekvő sugarú körök (nincs véletlen zaj).
    const ring = Math.floor(i / 12);
    const ang = ((i % 12) / 12) * Math.PI * 2 + ring * 0.26;
    const rr = 130 + ring * 90;
    VV.shown[c.id] = { id: c.id, x: px + rr * Math.cos(ang), y: py + rr * Math.sin(ang) };
    if (VG.nodes[c.id] && VG.nodes[c.id].type === 'collector') {
      if (!VV.revBy[c.id]) VV.revBy[c.id] = id;
    }
  });
  const left = rest ? [] : cands.slice(VV.cfg.maxNodes).map(c => c.id);
  if (left.length) {
    const cur = VV.rest[id] || [];
    VV.rest[id] = cur.concat(left.filter(x => cur.indexOf(x) < 0));
  } else if (rest) {
    VV.rest[id] = [];
  }
  VV.expanded[id] = 1;
  return batch.length;
}
function vExpandRest(id) {
  const more = (VV.rest && VV.rest[id]) || [];
  if (!more.length) return 0;
  const batch = more.slice(0, VV.cfg.maxNodes);
  const px = VV.shown[id] ? VV.shown[id].x : 450, py = VV.shown[id] ? VV.shown[id].y : 310;
  batch.forEach((nid, i) => {
    const ring = Math.floor(i / 12);
    const ang = ((i % 12) / 12) * Math.PI * 2 + ring * 0.26;
    const rr = 150 + ring * 90;
    VV.shown[nid] = { id: nid, x: px + rr * Math.cos(ang), y: py + rr * Math.sin(ang) };
    if (VG.nodes[nid] && VG.nodes[nid].type === 'collector' && !VV.revBy[nid]) VV.revBy[nid] = id;
  });
  VV.rest[id] = more.slice(VV.cfg.maxNodes);
  return batch.length;
}
function vCollectEdges() {
  const seen = {}, out = [];
  Object.keys(VV.shown).forEach(id => {
    (VG.adj[id] || []).forEach(a => {
      if (!VV.shown[a.to]) return;
      const k = id < a.to ? id + '|' + a.to + '|' + a.e.kind + '|' + a.e.role : a.to + '|' + id + '|' + a.e.kind + '|' + a.e.role;
      if (seen[k]) return;
      seen[k] = 1;
      out.push(a.e);
    });
  });
  (VV.sedges || []).forEach(e => {
    if (VV.shown[e.source] && VV.shown[e.target]) out.push(e);
  });
  return out;
}
function vEdgeCls(e) {
  let c = '';
  if (e.flag) c += ' dash';
  const Y = VV.cfg.year;
  if (Y !== null && Y !== undefined && Y !== '') {
    const y = Number(Y);
    if ((e.from && e.from > y) || (e.to && e.to < y)) c += ' dim';
    else if (!e.from && !e.to) c += ' unper';
  }
  if (VV.cfg.onlySrc && !e.src) c += ' faint';
  if (VV.cfg.onlyFlag && !e.flag) c += ' faint';
  return c;
}
function vNodeFaint(id) {
  const n = VG.nodes[id];
  if (!n) return false;
  if (n.type === 'company' || n.type === 'collector') {
    if ((n.totalHuf || 0) < (VV.cfg.amountMin * 1e9 || 0)) return true;
  }
  if (n.type === 'person') {
    if (vOrgCount(id) < VV.cfg.shared) return true;
    if (VV.cfg.bridgesOnly && !vIsBridge(id)) return true;
  }
  return false;
}
// Kijelölési gyűrű a kiválasztott csomópont köré (azonnali vizuális visszajelzés).
function vSelRing(nd) {
  if (!nd || nd.id !== VV.sel) return '';
  return '<circle class="selring" cx="0" cy="0" r="' + (nd.r + 6).toFixed(1) +
    '" fill="none" style="stroke:var(--vacc)" stroke-width="2.5"/>';
}
// Tartós kitűzés (pin): kattintásra felkerül, második kattintásra lekerül,
// navigáláskor is megmarad — így saját térkép rajzolható. Sorrend-jelvényt kap.
function vTogglePin(id) {
  if (!id || !VG.nodes[id]) return false;
  if (VV.pins[id]) { delete VV.pins[id]; return false; }
  VV.pins[id] = ++VV.pinSeq;
  return true;
}
function vPinRank() {
  const ids = Object.keys(VV.pins).sort((a, b) => VV.pins[a] - VV.pins[b]);
  const rank = {};
  ids.forEach((id, i) => { rank[id] = i + 1; });
  return rank;
}
function vPinRing(nd) {
  if (!nd || !VV.pins[nd.id]) return '';
  const rank = vPinRank()[nd.id] || 0;
  const rr = (nd.r + 10).toFixed(1);
  return '<circle class="pinring" cx="0" cy="0" r="' + rr +
    '" fill="none" style="stroke:var(--vgold)" stroke-width="3"/>' +
    '<g transform="translate(' + (nd.r * 0.7).toFixed(1) + ',' + (-nd.r * 0.7).toFixed(1) + ')">' +
    '<circle cx="0" cy="0" r="10" style="fill:var(--vgold)"/>' +
    '<text x="0" y="4" font-size="11" text-anchor="middle" fill="#0b1220" font-weight="bold">' + rank + '</text>' +
    '<title>📌 Kitűzve (' + rank + '. — kattints újra a levételhez)</title></g>';
}
function vRender() {
  const svg = document.getElementById('vg');
  const msg = document.getElementById('vmsg');
  if (!svg) return;
  const ids = Object.keys(VV.shown);
  if (ids.length > 300 && msg) {
    msg.textContent = 'Figyelem: ' + ids.length + ' látható pont 300 fölött — SVG lassulhat. 300 fölött Canvas/Sigma.js kellene; a sapkák miatt nem érjük el.';
  } else if (msg) {
    msg.textContent = '';
  }
  // Ghost-küszöb: 120 pont fölött a fókuszon (kijelölt + szomszédai) kívül minden 15%.
  const ghostOn = ids.length > 120;
  const focus = {};
  const focusAdd = fid => {
    if (!VV.shown[fid]) return;
    focus[fid] = 1;
    (VG.adj[fid] || []).forEach(a => { if (VV.shown[a.to]) focus[a.to] = 1; });
  };
  if (ghostOn && VV.sel && VV.shown[VV.sel]) focusAdd(VV.sel);
  // A kitűzött pontok és szomszédaik sosem ghostosodnak.
  if (ghostOn) Object.keys(VV.pins).forEach(focusAdd);
  const nodes = ids.map(id => {
    const n = VG.nodes[id], s = VV.shown[id];
    let r = 12;
    if (n.type === 'company') r = vCoR(n);
    else if (n.type === 'collector') r = (n.label === 'Magyar Állam' ? 8 : vCoR(n));
    else if (n.type === 'person') r = 10;
    else if (n.type === 'project') r = vCoinR(n.amountHuf);
    return { id, n, x: s.x, y: s.y, r };
  });
  const idx = {};
  nodes.forEach((nd, i) => { nd.i = i; idx[nd.id] = i; });
  // Kijelölt középen (pin a layout idejére).
  let pinNd = null;
  if (VV.sel && idx[VV.sel] !== undefined) {
    pinNd = nodes[idx[VV.sel]];
    pinNd.fx = 450; pinNd.fy = 310;
    pinNd.x = 450; pinNd.y = 310;
  }
  const edgesAll = vCollectEdges();
  // Kollektor-élek: csak a feltáró él, vagy kijelölve max 25 legerősebb.
  const maShow = [], maHide = [];
  const edges = [];
  edgesAll.forEach(e => {
    const na = VG.nodes[e.source], nb = VG.nodes[e.target];
    const cid = na && na.type === 'collector' ? e.source : (nb && nb.type === 'collector' ? e.target : null);
    if (!cid || e.kind === 'projekt') { edges.push(e); return; }
    const other = cid === e.source ? e.target : e.source;
    if (cid === VV.sel) { maShow.push(e); return; }
    if (VV.revBy[cid] && other === VV.revBy[cid]) { edges.push(e); return; }
    maHide.push(e);
  });
  maShow.sort((a, b) => {
    const ta = ((VG.nodes[a.source] || {}).type === 'collector' ? VG.nodes[a.target] : VG.nodes[a.source]) || {};
    const tb = ((VG.nodes[b.source] || {}).type === 'collector' ? VG.nodes[b.target] : VG.nodes[b.source]) || {};
    return ((tb.totalHuf || 0) - (ta.totalHuf || 0));
  });
  const maHiddenN = Math.max(0, maShow.length - 25);
  VV.maHidden = maHiddenN;
  maShow.slice(0, 25).forEach(e => edges.push(e));
  const epairs = [];
  edges.forEach(e => {
    const a = idx[e.source], b = idx[e.target];
    if (a !== undefined && b !== undefined) epairs.push([a, b]);
  });
  vLayout(nodes, epairs, VV._needFull ? undefined : 25);
  VV._needFull = false;
  nodes.forEach(nd => {
    nd.fx = null; nd.fy = null;
    VV.shown[nd.id].x = nd.x; VV.shown[nd.id].y = nd.y;
  });
  const inPathN = {}, inPathE = {};
  (VV.path || []).forEach(st => {
    inPathN[st.node] = 1;
    if (st.via && st.from) inPathE[st.from + '|' + st.node] = 1, inPathE[st.node + '|' + st.from] = 1;
  });
  const hasPath = (VV.path || []).length > 0;
  const hasSel = !!VV.sel;
  const selNbr = {};
  if (VV.sel) (VG.adj[VV.sel] || []).forEach(a => { if (VV.shown[a.to]) selNbr[a.to] = 1; });
  // Felirat-szabály: kijelölt / hover-közeli (DOM) / szomszéd / top-8 cég / zoom>1.6.
  const vk = VV.vb ? 900 / VV.vb.w : 1;
  const coByTotal = nodes.filter(nd => nd.n.type === 'company')
    .sort((a, b) => ((b.n.totalHuf || 0) - (a.n.totalHuf || 0))).slice(0, 8);
  const top8 = {};
  coByTotal.forEach(nd => { top8[nd.id] = 1; });
  const labWanted = {};
  nodes.forEach(nd => {
    if (nd.n.type === 'project' || nd.n.type === 'pile') return;
    if (nd.n.type === 'collector') return; // felirat nélkül (tooltip + panel azonosít)
    if (ghostOn && !focus[nd.id]) return; // ghost-réteg: felirat nélkül
    if (nd.id === VV.sel || selNbr[nd.id] || top8[nd.id] || vk > 1.6 || VV.pins[nd.id]) labWanted[nd.id] = 1;
  });
  // Érme-összegek: top-3 érme + a kijelölt cég érméi.
  const coinNodes = nodes.filter(nd => nd.n.type === 'project')
    .sort((a, b) => ((b.n.amountHuf || 0) - (a.n.amountHuf || 0)));
  const coinAmt = {};
  coinNodes.slice(0, 3).forEach(nd => { coinAmt[nd.id] = 1; });
  if (VV.sel) coinNodes.forEach(nd => {
    if (String(nd.id).indexOf('j:' + VV.sel + ':') === 0) coinAmt[nd.id] = 1;
  });
  // Greedy ütközésmentesítés a kért feliratokon (prioritás: kijelölt > szomszéd > top8 > zoom).
  const labPri = nd => (nd.id === VV.sel ? 300 : 0) + (selNbr[nd.id] ? 200 : 0) + (top8[nd.id] ? 100 : 0) +
    (VV.pins[nd.id] ? 150 : 0) +
    (nd.n.type === 'company' ? ((nd.n.totalHuf || 0) / 1e9) : 0);
  const labRows = nodes.filter(nd => labWanted[nd.id]).map(nd => {
    const t = String(nd.n.label || '').slice(0, 22) + (String(nd.n.label || '').length > 22 ? '…' : '');
    const w = Math.min(160, t.length * 6.5 + 8);
    const below = nd.n.type !== 'person';
    return { nd, t, w, h: 13, x0: below ? nd.x - w / 2 : nd.x + 12, y0: below ? nd.y + nd.r + 4 : nd.y - 6,
      pr: labPri(nd) };
  }).sort((a, b) => b.pr - a.pr);
  const labKept = {}, labBoxes = [];
  labRows.forEach(L => {
    const x2 = L.x0 + L.w, y2 = L.y0 + L.h;
    const hit = labBoxes.some(K => L.x0 < K.x2 + 2 && x2 > K.x1 - 2 && L.y0 < K.y2 + 1 && y2 > K.y1 - 1);
    if (!hit) { labKept[L.nd.id] = L.t; labBoxes.push({ x1: L.x0, y1: L.y0, x2, y2 }); }
  });
  VV.lastLabels = labKept;
  VV.lastLabelBoxes = labBoxes;
  let s = '<defs>' +
    '<symbol id="vcoin" viewBox="0 0 40 40">' +
    '<circle cx="20" cy="20" r="18" fill="var(--vgold)" stroke="#8a6d1b" stroke-width="2"/>' +
    '<circle cx="20" cy="20" r="12.5" fill="none" stroke="#8a6d1b" stroke-width="1.5"/>' +
    '<text x="20" y="25" font-size="11" text-anchor="middle" fill="#5b4a00" font-weight="bold">Ft</text>' +
    '</symbol>' +
    '<symbol id="vpile" viewBox="0 0 40 40">' +
    '<ellipse cx="20" cy="26" rx="14" ry="6" fill="var(--vgold)" stroke="#8a6d1b" stroke-width="2"/>' +
    '<ellipse cx="20" cy="20" rx="14" ry="6" fill="var(--vgold)" stroke="#8a6d1b" stroke-width="2"/>' +
    '<ellipse cx="20" cy="14" rx="14" ry="6" fill="var(--vgold)" stroke="#8a6d1b" stroke-width="2"/>' +
    '</symbol></defs>';
  const eIncident = id => (VV.sel && (id === VV.sel || selNbr[id])) ? 1 : 0;
  edges.forEach(e => {
    const a = idx[e.source], b = idx[e.target];
    if (a === undefined || b === undefined) return;
    const A = nodes[a], B = nodes[b];
    const col = VKIND[e.kind] || VKIND['egyéb'];
    let op = 0.35;
    const cls = vEdgeCls(e) + ((hasPath && !(inPathE[e.source + '|' + e.target])) ? ' dim' : '') +
      ((hasPath && inPathE[e.source + '|' + e.target]) ? ' hl' : '');
    s += '<line data-vedge data-a="' + vEsc(e.source) + '" data-b="' + vEsc(e.target) + '" x1="' + A.x.toFixed(1) + '" y1="' + A.y.toFixed(1) +
      '" x2="' + B.x.toFixed(1) + '" y2="' + B.y.toFixed(1) + '" style="stroke:' + col +
      '" stroke-width="' + vEdgeW(e).toFixed(1) + '" class="' + cls.trim() + '"' +
      ' opacity="' + op + '"><title>' + vEsc(e.role || e.kind) + '</title></line>';
  });
  nodes.forEach(nd => {
    const n = nd.n;
    const ghost = (ghostOn && !focus[nd.id]) ? ' ghost' : '';
    const dimP = (hasPath && !inPathN[nd.id]) ? ' dim' : '';
    const hlP = (hasPath && inPathN[nd.id]) ? ' hl' : '';
    const hid = vHiddenN(nd.id);
    const badge = hid > 0 ? '<g data-vmore="' + vEsc(nd.id) + '" transform="translate(' +
      (nd.r * 0.75).toFixed(1) + ',' + (-nd.r * 0.75).toFixed(1) + ')" style="cursor:pointer">' +
      '<circle cx="0" cy="0" r="11" fill="var(--vacc)"/>' +
      '<text x="0" y="4" font-size="11" text-anchor="middle" fill="#0b1220" font-weight="bold">+' + hid + '</text>' +
      '<title>Még ' + hid + ' kapcsolat — kattints a kibontáshoz</title></g>' : '';
    const shapeCls = (vNodeFaint(nd.id) ? ' faint' : '') + dimP + hlP + ghost;
    const lbl = labKept[nd.id];
    const lblHtml = lbl !== undefined
      ? '<text data-fs="12" y="' + (n.type === 'person' ? 4 : (nd.r + 14).toFixed(0)) + '" ' +
        (n.type === 'person' ? 'x="12" ' : '') + 'font-size="12" fill="var(--vtxt)" text-anchor="' +
        (n.type === 'person' ? 'start' : 'middle') + '" style="paint-order:stroke;stroke:var(--vbg);stroke-width:3px">' +
        vEsc(lbl) + '<title>' + vEsc(n.label) + '</title></text>' : '';
    if (n.type === 'company') {
      s += '<g data-vnode="' + vEsc(nd.id) + '" tabindex="0" role="button" aria-label="' + vEsc(n.label) + '"' +
        ' transform="translate(' + nd.x.toFixed(1) + ',' + nd.y.toFixed(1) + ')" class="' + ghost.trim() + '">' + vSelRing(nd) + vPinRing(nd) +
        '<g class="vzoom" transform="scale(1)">' +
        '<circle data-br="' + nd.r.toFixed(1) + '" cx="0" cy="0" r="' + nd.r.toFixed(1) + '" style="fill:var(--vcomp)" fill-opacity="0.2" stroke="var(--vacc)" stroke-width="2" class="' + shapeCls.trim() + '"/>' +
        lblHtml + badge + '</g></g>';
    } else if (n.type === 'collector') {
      s += '<g data-vnode="' + vEsc(nd.id) + '" tabindex="0" role="button" aria-label="' + vEsc(n.label) + '"' +
        ' transform="translate(' + nd.x.toFixed(1) + ',' + nd.y.toFixed(1) + ')" class="' + ghost.trim() + '">' + vSelRing(nd) + vPinRing(nd) +
        '<g class="vzoom" transform="scale(1)">' +
        '<circle data-br="8" cx="0" cy="0" r="8" style="fill:var(--vcol)" stroke="var(--vmut)" stroke-width="2" class="' + shapeCls.trim() + '">' +
        '<title>' + vEsc(n.label) + ' (gyűjtő-tulajdonos)</title></circle>' + badge + '</g></g>';
    } else if (n.type === 'person') {
      const bridge = vIsBridge(nd.id);
      s += '<g data-vnode="' + vEsc(nd.id) + '" tabindex="0" role="button" aria-label="' + vEsc(n.label) + '"' +
        ' transform="translate(' + nd.x.toFixed(1) + ',' + nd.y.toFixed(1) + ')" class="' + ghost.trim() + '">' + vSelRing(nd) + vPinRing(nd) +
        '<g class="vzoom" transform="scale(1)">' +
        '<circle data-br="6" cx="0" cy="0" r="6" style="fill:var(--vper)" stroke="var(--vline)" stroke-width="1.5" class="' + shapeCls.trim() + '"/>' +
        (bridge ? '<circle cx="0" cy="0" r="10" fill="none" style="stroke:var(--vtxt)" stroke-width="1.5" opacity="0.8"><title>Hídszemély</title></circle>' : '') +
        lblHtml + badge + '</g></g>';
    } else if (n.type === 'project') {
      const showAmt = coinAmt[nd.id] ? vFmtShort(n.amountHuf) : '';
      const sc = (nd.r * 2 / 40).toFixed(2);
      s += '<g data-vnode="' + vEsc(nd.id) + '" tabindex="0" role="button" aria-label="' + vEsc(n.label) + '"' +
        ' transform="translate(' + nd.x.toFixed(1) + ',' + nd.y.toFixed(1) + ')" class="' + ghost.trim() + '">' + vSelRing(nd) + vPinRing(nd) +
        '<g class="vzoom" transform="scale(1)">' +
        '<use href="#vcoin" x="' + (-20 * sc) + '" y="' + (-20 * sc) + '" width="' + (40 * sc) + '" height="' + (40 * sc) + '" class="' + shapeCls.trim() + '">' +
        '<title>' + vEsc(n.label) + (n.amountHuf ? ' — ' + vFmt(n.amountHuf) : '') + '</title></use>' +
        (showAmt ? '<text data-fs="11" y="' + (nd.r + 13).toFixed(0) + '" font-size="11" fill="var(--vgold)" text-anchor="middle" style="paint-order:stroke;stroke:var(--vbg);stroke-width:3px">' +
          vEsc(showAmt) + '</text>' : '') + badge + '</g></g>';
    } else if (n.type === 'pile') {
      s += '<g data-vnode="' + vEsc(nd.id) + '" tabindex="0" role="button" aria-label="' + vEsc(n.label) + '"' +
        ' transform="translate(' + nd.x.toFixed(1) + ',' + nd.y.toFixed(1) + ')" class="' + ghost.trim() + '">' + vSelRing(nd) + vPinRing(nd) +
        '<g class="vzoom" transform="scale(1)">' +
        '<use href="#vpile" x="-20" y="-20" width="40" height="40" class="' + shapeCls.trim() + '"><title>' + vEsc(n.label) + '</title></use>' +
        '<text data-fs="11" y="32" font-size="11" fill="var(--vgold)" text-anchor="middle" style="paint-order:stroke;stroke:var(--vbg);stroke-width:3px">' +
        vEsc(n.sub || '') + '</text>' + badge + '</g></g>';
    } else {
      s += '<g data-vnode="' + vEsc(nd.id) + '" tabindex="0" role="button" aria-label="' + vEsc(n.label) + '"' +
        ' transform="translate(' + nd.x.toFixed(1) + ',' + nd.y.toFixed(1) + ')" class="' + ghost.trim() + '">' + vSelRing(nd) + vPinRing(nd) +
        '<g class="vzoom" transform="scale(1)">' +
        '<rect x="-9" y="-9" width="18" height="18" style="fill:var(--vcol)" stroke="var(--vline)" stroke-width="2" class="' + shapeCls.trim() + '"/>' +
        lblHtml + badge + '</g></g>';
    }
  });
  svg.innerHTML = s;
  const nodeEls = [], edgeEls = [];
  svg.querySelectorAll('[data-vnode]').forEach(g => nodeEls.push({ id: g.dataset.vnode, el: g }));
  svg.querySelectorAll('[data-vedge]').forEach(p => edgeEls.push({ a: p.dataset.a, b: p.dataset.b, el: p }));
  const byNode = {};
  nodes.forEach(nd => { byNode[nd.id] = nd; });
  VV._lay = { nodes, byIdx: idx, byNode, epairs, nodeEls, edgeEls };
  svg.querySelectorAll('[data-vnode]').forEach(g => {
    g.addEventListener('click', ev => { ev.stopPropagation(); vNodeClick(g.dataset.vnode); });
    g.addEventListener('dblclick', ev => { ev.stopPropagation(); vNodeDbl(g.dataset.vnode); });
    g.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); vNodeClick(g.dataset.vnode); }
      if (ev.key === 'p' || ev.key === 'P') { vNodeDbl(g.dataset.vnode); }
    });
  });
  svg.querySelectorAll('[data-vmore]').forEach(g => {
    g.addEventListener('click', ev => {
      ev.stopPropagation();
      const id = g.dataset.vmore;
      let n = vExpandRest(id);
      if (n === 0 && !VV.expanded[id]) n = vExpand(id, false);
      vRender(); vPanel(); if (n > 0) vFit();
    });
  });
  svg.querySelectorAll('[data-vnode]').forEach(g => {
    g.addEventListener('mouseover', ev => vHover(g.dataset.vnode, ev));
    g.addEventListener('mouseout', () => vUnhover());
  });
  vApplySelIso();
  vApplyVZ();
  vUpdateCounts();
}
// Kijelölés-izoláció DOM-passz (hover után is visszaállítja).
function vApplySelIso() {
  try {
    const svg = document.getElementById('vg');
    if (!svg || !VV.sel) return;
    const inc = {};
    inc[VV.sel] = 1;
    (VG.adj[VV.sel] || []).forEach(a => { if (VV.shown[a.to]) inc[a.to] = 1; });
    svg.querySelectorAll('[data-vnode]').forEach(g => {
      if (g.dataset.vnode !== VV.sel && !inc[g.dataset.vnode]) g.setAttribute('opacity', '0.25');
    });
    svg.querySelectorAll('[data-vedge]').forEach(p => {
      const hit = p.dataset.a === VV.sel || p.dataset.b === VV.sel;
      p.setAttribute('opacity', hit ? '1' : '0.08');
    });
  } catch (e) {}
}
function vHover(id, ev) {
  const tip = document.getElementById('vtip');
  const n = VG.nodes[id];
  if (tip && n) {
    let sub = '';
    if (n.type === 'company' || n.type === 'collector') sub = vFmt(n.totalHuf) + ' · ' + (n.projectCount || '?') + ' projekt';
    else if (n.type === 'person') sub = vOrgCount(id) + ' szervezetben';
    else if (n.type === 'project') sub = vFmtShort(n.amountHuf) + ' · ' + (n.winner || '');
    else sub = n.sub || '';
    tip.innerHTML = '<b>' + vEsc(n.label) + '</b><br><span>' + vEsc(sub) + '</span><br><span style="color:var(--vlink)">kattints a részletekért</span>';
    tip.style.display = 'block';
    try {
      const w = (typeof window !== 'undefined' && window.innerWidth) || 1200;
      tip.style.left = Math.min(ev.clientX + 14, w - 335) + 'px';
      tip.style.top = (ev.clientY + 16) + 'px';
    } catch (e) {}
  }
  try {
    const svg = document.getElementById('vg');
    if (!svg) return;
    const inc = {};
    inc[id] = 1;
    (VG.adj[id] || []).forEach(a => { if (VV.shown[a.to]) inc[a.to] = 1; });
    svg.querySelectorAll('[data-vnode]').forEach(g => {
      if (g.dataset.vnode !== id && !inc[g.dataset.vnode]) g.setAttribute('opacity', '0.25');
    });
    svg.querySelectorAll('[data-vedge]').forEach(p => {
      const hit = p.dataset.a === id || p.dataset.b === id;
      p.setAttribute('opacity', hit ? '1' : '0.08');
    });
  } catch (e) {}
}
function vUnhover() {
  const tip = document.getElementById('vtip');
  if (tip) tip.style.display = 'none';
  try {
    const svg = document.getElementById('vg');
    if (!svg) return;
    svg.querySelectorAll('[data-vnode]').forEach(g => g.removeAttribute('opacity'));
    svg.querySelectorAll('[data-vedge]').forEach(p => p.removeAttribute('opacity'));
  } catch (e) {}
  vApplySelIso();
}
// Képernyő-pixelben állandó méretek zoomnál: a belső .vzoom csoport visszaskáláz.
function vApplyVZ() {
  const k = VV.vb ? 900 / VV.vb.w : 1;
  try {
    const svg = document.getElementById('vg');
    if (!svg) return;
    svg.querySelectorAll('#vg .vzoom, #vg [data-vnode] > g.vzoom').forEach(g => {
      g.setAttribute('transform', 'scale(' + (1 / k).toFixed(3) + ')');
    });
  } catch (e) {}
}
function vRR(nd) {  const n = nd.n || nd;
  if ((n.type === 'company' || n.type === 'collector')) return vCoR(n);
  if (n.type === 'person') return 10;
  if (n.type === 'project') return vCoinR(n.amountHuf);
  return 12;
}
function vHiddenN(id) {
  let c = 0;
  (VG.adj[id] || []).forEach(a => {
    if (!VV.shown[a.to] && !VV.hidden[a.to] && a.to !== id) c++;
  });
  return c;
}
function vUpdateCounts() {
  const el = document.getElementById('vcounts');
  if (el) el.textContent = Object.keys(VV.shown).length + ' pont · ' + vCollectEdges().length + ' él';
}
async function vFetchProjects(coLabel) {
  if (VV.projCache[coLabel]) return VV.projCache[coLabel];
  try {
    const r = await fetch('/api/company?name=' + encodeURIComponent(coLabel)).then(r => r.json());
    const projs = ((r && r.projects) || []).slice().sort((a, b) => b.amount_huf - a.amount_huf);
    VV.projCache[coLabel] = projs;
    return projs;
  } catch (e) {
    VV.projCache[coLabel] = null;
    return null;
  }
}
function vNormTitle(t) {
  return String(t || '').toLowerCase().replace(/[^a-záéíóöőúüű0-9]+/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}
async function vShowProjects(coId, silent) {
  const co = VG.nodes[coId];
  if (!co) return 0;
  const projs = await vFetchProjects(co.label);
  const px = VV.shown[coId] ? VV.shown[coId].x : 450, py = VV.shown[coId] ? VV.shown[coId].y : 310;
  if (projs === null) {
    const pid = 'pile:' + coId;
    if (!VV.shown[pid]) {
      VV.shown[pid] = { id: pid, x: px + 90, y: py - 60 };
      VG.nodes[pid] = { id: pid, type: 'pile', label: (co.projectCount || '?') + ' projekt érmehalom',
        sub: (co.projectCount || '?') + ' projekt · ' + vFmt(co.totalHuf || 0) };
      VV.sedges.push({ source: coId, target: pid, kind: 'projekt', role: 'nyertes projektek (összesítve)', amountHuf: co.totalHuf || 0 });
    }
    VV.projOf[coId] = [pid];
    if (!silent) { vRender(); vPanel(); }
    return 1;
  }
  // Közös címek: ugyanaz a projekt több látható cégnél → EGY közös érme.
  const byTitle = {};
  projs.slice(0, 200).forEach((p, i) => {
    const t = vNormTitle(p.title);
    if (!t) return;
    (byTitle[t] = byTitle[t] || []).push({ p, i });
  });
  const titles = Object.keys(byTitle);
  let added = 0;
  const myCoins = [];
  titles.forEach((t, j) => {
    if (myCoins.length >= 8) return; // max 8 önálló érme, a többi halomba
    const pid = vMakeCoin(coId, t, byTitle[t][0].p, j);
    if (pid) { myCoins.push(pid); added++; }
  });
  // Halom: a maradék egy közös "+N további · X Mrd Ft" csomópont.
  const restTitles = titles.slice(8);
  if (restTitles.length) {
    let restCount = 0, restSum = 0;
    restTitles.forEach(t => {
      restCount += byTitle[t].length;
      byTitle[t].forEach(x => { restSum += x.p.amount_huf || 0; });
    });
    const pid = 'pile:' + coId;
    if (!VV.shown[pid]) {
      VV.shown[pid] = { id: pid, x: px + 130, y: py - 90 };
      VV.sedges.push({ source: coId, target: pid, kind: 'projekt', role: 'további projektek (összesítve)', amountHuf: restSum });
    }
    VG.nodes[pid] = { id: pid, type: 'pile', label: '+' + restCount + ' további',
      sub: '+' + restCount + ' további · ' + vFmtShort(restSum), coId };
    myCoins.push(pid);
  }
  VV.projOf[coId] = myCoins;
  if (!silent) { vRender(); vPanel(); if (added > 0) vFit(); }
  return added;
}
function vMakeCoin(coId, t, p0, j) {
  const pid = 'j:' + coId + ':' + j;
  if (VV.shown[pid]) return null;
  const px = VV.shown[coId] ? VV.shown[coId].x : 450, py = VV.shown[coId] ? VV.shown[coId].y : 310;
  const sharedOwners = [coId];
  Object.keys(VV.shown).forEach(id => {
    if (id === coId || id === pid) return;
    const n = VG.nodes[id];
    if (!n || (n.type !== 'company' && n.type !== 'collector')) return;
    const op = (VV.projCache[n.label] || []).filter(q => vNormTitle(q.title) === t);
    if (op.length) sharedOwners.push(id);
  });
  const ang = (((VV.projOf[coId] || []).length) / 15) * Math.PI * 2;
  VV.shown[pid] = { id: pid, x: px + 110 * Math.cos(ang), y: py + 110 * Math.sin(ang) };
  VG.nodes[pid] = { id: pid, type: 'project', label: String(p0.title || '').slice(0, 70),
    sub: vFmt(p0.amount_huf), amountHuf: p0.amount_huf, date: p0.date,
    winner: p0.winner || ((VG.nodes[coId] || {}).label || ''), url: p0.url || '', owners: sharedOwners };
  sharedOwners.forEach(oid => {
    VV.sedges.push({ source: oid, target: pid, kind: 'projekt',
      role: sharedOwners.length > 1 ? 'közös projekt' : 'nyertes projekt',
      amountHuf: p0.amount_huf, src: p0.url || '' });
  });
  return pid;
}
function vOpenPile(coId) {
  const co = VG.nodes[coId];
  if (!co) return 0;
  const projs = VV.projCache[co.label] || [];
  if (!projs.length) return 0;
  const byTitle = {};
  projs.slice(0, 200).forEach(p => {
    const t = vNormTitle(p.title);
    if (t) (byTitle[t] = byTitle[t] || []).push(p);
  });
  const titles = Object.keys(byTitle);
  const have = {};
  (VV.projOf[coId] || []).forEach(pid => {
    const nn = VG.nodes[pid];
    if (nn && nn.type === 'project') have[vNormTitle(nn.label)] = 1;
  });
  let cur = Object.keys(have).length;
  let added = 0;
  const myCoins = VV.projOf[coId] || [];
  titles.forEach((t, j) => {
    if (have[t] || cur >= 40) return;
    const pid = vMakeCoin(coId, t, byTitle[t][0], j);
    if (pid) { myCoins.push(pid); added++; have[t] = 1; cur++; }
  });
  VV.projOf[coId] = myCoins;
  const remaining = titles.filter(t => !have[t]);
  const pileId = 'pile:' + coId;
  if (!remaining.length) {
    delete VV.shown[pileId];
    delete VG.nodes[pileId];
    VV.sedges = VV.sedges.filter(e => e.target !== pileId);
    VV.projOf[coId] = myCoins.filter(pid => pid !== pileId);
  } else if (VG.nodes[pileId]) {
    let rc = 0, rs = 0;
    remaining.forEach(t => {
      rc += byTitle[t].length;
      byTitle[t].forEach(x => { rs += x.amount_huf || 0; });
    });
    VG.nodes[pileId].label = '+' + rc + ' további';
    VG.nodes[pileId].sub = '+' + rc + ' további · ' + vFmtShort(rs);
  }
  vRender();
  vPanel();
  return added;
}
function vNodeClick(id) {
  const n = VG.nodes[id];
  if (!n) return;
  // Séta: a bejárt út megmarad és kiemelődik; visszakattintás visszavágja.
  // Kitűzés: minden kattintás fel/le teszi a pint — a highlight navigáláskor is marad.
  const ti = VV.trail.indexOf(id);
  if (ti >= 0) VV.trail = VV.trail.slice(0, ti + 1);
  else VV.trail.push(id);
  vTogglePin(id);
  VV.sel = id;
  vTrailToPath();
  if (n.type === 'pile') {
    const cid = id.slice(5);
    vOpenPile(cid);
    return;
  }
  if (!VV.expanded[id]) {
    const added = vExpand(id, false);
    vRender();
    if (added > 0) vFit();
  } else {
    vRender();
  }
  vPanel();
}
function vTrailToPath() {
  const t = VV.trail;
  if (t.length < 2) { VV.path = null; return; }
  const steps = [{ node: t[0] }];
  for (let i = 1; i < t.length; i++) {
    const a = t[i - 1], b = t[i];
    let via = null;
    (VG.adj[a] || []).forEach(ad => { if (!via && ad.to === b) via = ad.e; });
    if (!via) (VV.sedges || []).forEach(e => {
      if (!via && ((e.source === a && e.target === b) || (e.source === b && e.target === a))) via = e;
    });
    steps.push({ node: b, via, from: a });
  }
  VV.path = steps;
}
function vClearWalk() {
  VV.trail = [];
  VV.path = null;
  VV.sel = null;
  vRender();
  vPanel();
}
function vNodeDbl(id) {
  const n = VG.nodes[id];
  if (!n) return;
  if (n.type === 'company' || n.type === 'collector') {
    vShowProjects(id, false);
  } else if (n.type === 'person') {
    vPersonProjects(id);
  }
}
async function vPersonProjects(personId) {
  const comps = [];
  (VG.adj[personId] || []).forEach(a => {
    const n = VG.nodes[a.to];
    if (n && (n.type === 'company' || n.type === 'collector') && comps.indexOf(a.to) < 0) comps.push(a.to);
  });
  comps.sort((a, b) => ((VG.nodes[b] || {}).totalHuf || 0) - ((VG.nodes[a] || {}).totalHuf || 0));
  const top = comps.slice(0, 8);
  for (let i = 0; i < top.length; i++) {
    await vShowProjects(top[i], true);
  }
  vRender();
  vPanel();
  vFit();
}
function vRelHtml(id) {
  const groups = {};
  (VG.adj[id] || []).forEach(a => {
    const e = a.e;
    (groups[e.kind] = groups[e.kind] || []).push({ to: a.to, e });
  });
  const order = ['tulajdon', 'vezetés', 'testület', 'kivitelező', 'konzorcium', 'projekt', 'egyéb'];
  let html = '';
  order.forEach(k => {
    (groups[k] || []).forEach(r => {
      const n = VG.nodes[r.to];
      if (!n) return;
      const per = (r.e.from || r.e.to) ? ' <span style="color:var(--vmut)">(' + (r.e.from || '?') + '–' + (r.e.to || '') + ')</span>' : '';
      const flag = r.e.flag ? ' <b style="color:var(--vgold)">[ellenőrizendő]</b>' : '';
      const src = r.e.src ? ' <a class="vlink" href="' + vEsc(r.e.src) + '" target="_blank" rel="noopener">forrás ↗</a>'
        : ' <span style="color:var(--vmut)">nincs nyitható forrás</span>';
      html += '<div>• <b>' + vEsc(n.label) + '</b> <span style="color:var(--vmut)">[' + vEsc(k) +
        (r.e.role && r.e.role !== k ? ': ' + vEsc(r.e.role) : '') + ']' + per + '</span>' + flag + '<br>' + src + '</div>';
    });
  });
  return html || '<span style="color:var(--vmut)">Nincs ismert kapcsolat.</span>';
}
function vPanel() {
  const box = document.getElementById('vpanel');
  if (!box) return;
  // 📌 Saját térkép: a kitűzött pontok sorrendben, navigálástól függetlenül megmaradnak.
  let pinsHtml = '';
  const pinIds = Object.keys(VV.pins).sort((a, b) => VV.pins[a] - VV.pins[b]);
  if (pinIds.length) {
    pinsHtml = '<div class="vrow" style="background:var(--vbg);border-radius:8px;padding:6px 8px;margin-bottom:8px">' +
      '<span>📌 Saját térkép (' + pinIds.length + '): ' + pinIds.map((id, i) =>
        '<a href="#" data-vreveal="' + vEsc(id) + '" class="vlink">' + (i + 1) + '. ' +
        vEsc(String((VG.nodes[id] || {}).label || id).slice(0, 24)) + '</a>' +
        ' <a href="#" data-vunpin="' + vEsc(id) + '" class="vlink" title="levétel">✕</a>'
      ).join(' · ') + '</span>' +
      '<button class="vbtn" data-vact="clearpins">mindet töröl</button></div>';
  }
  const bindPanelActs = () => {
    box.querySelectorAll('[data-vunpin]').forEach(b => b.addEventListener('click', ev => {
      ev.preventDefault();
      vTogglePin(b.dataset.vunpin);
      vRender(); vPanel();
    }));
    box.querySelectorAll('[data-vreveal]').forEach(b => b.addEventListener('click', ev => {
      ev.preventDefault();
      vReveal(b.dataset.vreveal);
    }));
  };
  let trailHtml = '';
  if (VV.trail.length > 1) {
    trailHtml = '<div class="vrow" style="background:var(--vbg);border-radius:8px;padding:6px 8px;margin-bottom:8px">' +
      '<span>🚶 Séta (' + (VV.trail.length - 1) + ' lépés): ' + VV.trail.map(id =>
        vEsc(String((VG.nodes[id] || {}).label || id).slice(0, 22))).join(' → ') + '</span>' +
      '<button class="vbtn" data-vact="cleartrail">✕</button></div>';
  }
  const id = VV.sel;
  if (!id || !VG.nodes[id]) {
    box.innerHTML = pinsHtml + trailHtml + '<p style="color:var(--vmut);font-size:13px">Kattints egy pontra a részletekért.</p>';
    box.querySelectorAll('[data-vact]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.vact === 'cleartrail') vClearWalk();
      else if (b.dataset.vact === 'clearpins') { VV.pins = {}; vRender(); vPanel(); }
    }));
    bindPanelActs();
    return;
  }
  const n = VG.nodes[id];
  let typeBadge = n.type === 'company' ? '🏢 Cég'
    : n.type === 'collector' ? '🏛️ Gyűjtő-tulajdonos' + (/önkormányzat/i.test(n.label) ? ' (önkormányzati kör)' : '')
    : n.type === 'person' ? '🧍 Személy' : n.type === 'project' ? '🪙 Projekt' : '⬛ Szervezet';
  let head = '<b>' + vEsc(n.label) + '</b><br><span style="color:var(--vmut)">' + typeBadge + '</span>';
  if ((n.type === 'company' || n.type === 'collector') && n.totalHuf) {
    head += '<br><b>' + vFmt(n.totalHuf) + '</b> · ' + (n.projectCount || '?') + ' projekt';
  }
  if (n.type === 'project') {
    head += '<br><b>' + vFmt(n.amountHuf) + '</b>' + (n.date ? ' · ' + vEsc(n.date) : '') +
      (n.winner ? '<br>Nyertes: ' + vEsc(n.winner) : '') +
      (n.url ? '<br><a class="vlink" href="' + vEsc(n.url) + '" target="_blank" rel="noopener">Forrás ↗</a>' : '');
  }
  if (n.type === 'collector') {
    head += '<br><span style="color:var(--vmut)">Nem bomlik ki automatikusan — kattintásra a legnagyobb 25 cége.</span>';
    if (VV.maHidden > 0 && id === VV.sel) {
      head += '<br><span style="color:var(--vmut)">További ' + VV.maHidden + ' él rejtve (a legerősebb 25 látszik).</span>';
    }
  }
  const rest = ((VV.rest && VV.rest[id]) || []).length;
  let projList = '';
  if (n.type === 'company' || n.type === 'collector') {
    const all = VV.projCache[n.label] || [];
    if (all.length) projList = '<div class="mt-2" id="vprojwrap"></div>';
  }
  let btns = '<div class="vrow" style="margin-top:8px">';
  if (rest > 0) btns += '<button class="vbtn" data-vact="more">További ' + rest + ' mutatása</button>';
  if (n.type === 'company' || n.type === 'collector') btns += '<button class="vbtn" data-vact="projs">Nyertes projektek megjelenítése</button>';
  if (n.type === 'person') btns += '<button class="vbtn" data-vact="pprojs">Cégei projektjei</button>';
  btns += '<button class="vbtn" data-vact="focus">Csak a környezetét mutasd</button>';
  btns += '<button class="vbtn" data-vact="hide">Elrejt</button>';
  btns += '<button class="vbtn" data-vact="seta">A-pont</button>';
  btns += '<button class="vbtn" data-vact="setb">B-pont</button></div>';
  box.innerHTML = pinsHtml + trailHtml + head + '<div style="margin-top:8px;font-size:13px">' + vRelHtml(id) + '</div>' + projList + btns;
  const vProjDraw = f => {
    const all = VV.projCache[n.label] || [];
    const rows = all.slice().sort((a, b) => b.amount_huf - a.amount_huf)
      .filter(p => !f || String(p.title || '').toLowerCase().indexOf(f) >= 0);
    const lst = box.querySelector('#vprojlist');
    if (lst) lst.innerHTML = rows.slice(0, 200).map(p =>
      '<div>• <b>' + vEsc(String(p.title || '').slice(0, 60)) + '</b> — ' + vFmt(p.amount_huf) +
      ' · ' + vEsc(p.date || '') + '</div>').join('') +
      (rows.length > 200 ? '<div>…és még ' + (rows.length - 200) + '</div>' : '');
  };
  const wrap = box.querySelector('#vprojwrap');
  if (wrap) {
    const all = VV.projCache[n.label] || [];
    wrap.innerHTML = '<b>📋 Projektek (' + all.length + '):</b> ' +
      '<input id="vprojq" type="text" placeholder="szűrés…" style="background:var(--vbg);color:var(--vtxt);border:1px solid var(--vline);border-radius:8px;padding:2px 8px;font-size:12px;width:120px">' +
      '<div id="vprojlist" style="max-height:220px;overflow:auto;margin-top:4px"></div>';
    vProjDraw('');
    const pq = box.querySelector('#vprojq');
    if (pq) pq.addEventListener('input', () => vProjDraw(pq.value.toLowerCase()));
  }
  box.querySelectorAll('[data-vact]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.vact;
    if (a === 'more') { vExpandRest(id); vRender(); vPanel(); }
    else if (a === 'cleartrail') { vClearWalk(); }
    else if (a === 'clearpins') { VV.pins = {}; vRender(); vPanel(); }
    else if (a === 'projs') { vShowProjects(id, false); }
    else if (a === 'pprojs') { vPersonProjects(id); }
    else if (a === 'focus') { vFocusOnly(id); }
    else if (a === 'hide') { VV.hidden[id] = 1; delete VV.shown[id]; VV.sel = null; vRender(); vPanel(); }
    else if (a === 'seta') { VV.pathA = id; vSyncPathSel(); }
    else if (a === 'setb') { VV.pathB = id; vSyncPathSel(); }
  }));
  bindPanelActs();
}
function vFocusOnly(id) {
  const keep = {};
  keep[id] = 1;
  (VG.adj[id] || []).forEach(a => { keep[a.to] = 1; });
  VV.shown = {};
  const keys = Object.keys(keep);
  keys.forEach((k, i) => {
    if (VV.hidden[k]) return;
    if (k === id) { VV.shown[k] = { id: k, x: 450, y: 310 }; return; }
    const ang = (i / Math.max(1, keys.length)) * Math.PI * 2;
    VV.shown[k] = { id: k, x: 450 + 170 * Math.cos(ang), y: 310 + 170 * Math.sin(ang) };
  });
  VV.expanded = {}; VV.expanded[id] = 1;
  vRender();
  vPanel();
}
function vFindPath(a, b) {
  if (!a || !b || a === b || !VG.nodes[a] || !VG.nodes[b]) return null;
  const Y = (VV.cfg.year === null || VV.cfg.year === undefined || VV.cfg.year === '') ? null : Number(VV.cfg.year);
  const okE = e => {
    if (!VV.cfg.collectors) {
      const na = VG.nodes[e.source], nb = VG.nodes[e.target];
      if ((na && na.type === 'collector') || (nb && nb.type === 'collector')) return false;
    }
    if (Y !== null) {
      if ((e.from && e.from > Y) || (e.to && e.to < Y)) return false;
    }
    return true;
  };
  const seen = {}, prev = {}, q = [a];
  seen[a] = 1;
  while (q.length) {
    const cur = q.shift();
    if (cur === b) break;
    (VG.adj[cur] || []).forEach(ad => {
      if (!okE(ad.e) || seen[ad.to]) return;
      seen[ad.to] = 1;
      prev[ad.to] = { from: cur, e: ad.e };
      q.push(ad.to);
    });
  }
  if (!seen[b]) return null;
  const steps = [];
  let cur = b;
  while (cur !== a) {
    const p = prev[cur];
    steps.unshift({ node: cur, via: p.e, from: p.from });
    cur = p.from;
  }
  steps.unshift({ node: a });
  return steps;
}
function vShowPath() {
  const box = document.getElementById('vpanel');
  if (!box) return;
  const A = VV.pathA, B = VV.pathB;
  if (!A || !B) {
    box.innerHTML = '<p style="color:var(--vmut);font-size:13px">Válassz ki két pontot (A és B) az útkereséshez.</p>';
    return;
  }
  const steps = vFindPath(A, B);
  if (!steps) {
    VV.path = null;
    vRender();
    box.innerHTML = '<p style="font-size:13px"><b>Nincs ismert lánc</b> ' + vEsc((VG.nodes[A] || {}).label || A) +
      ' és ' + vEsc((VG.nodes[B] || {}).label || B) + ' között.' +
      '<br><span style="color:var(--vmut)">Ez csak a kutatott adatokra igaz.' +
      (!VV.cfg.collectors ? ' Gyűjtő-tulajdonosok kihagyva (kapcsolóval bevehetők).' : '') + '</span></p>';
    return;
  }
  VV.path = steps;
  VV.trail = steps.map(st => st.node);
  VV.sel = VV.trail[VV.trail.length - 1];
  vRender();
  let html = '<p style="font-size:13px"><b>Lánc (' + (steps.length - 1) + ' lépés):</b> ' +
    '<button class="vbtn" data-vact="cleartrail">✕</button></p>';
  steps.forEach((st, i) => {
    const n = VG.nodes[st.node] || {};
    html += '<div style="margin-bottom:6px">' + (i + 1) + '. <b>' + vEsc(n.label || st.node) + '</b>';
    if (st.via) {
      const e = st.via;
      const per = (e.from || e.to) ? ' (' + (e.from || '?') + '–' + (e.to || '') + ')' : ' (időszak ismeretlen)';
      html += '<br><span style="color:var(--vmut)">↳ ' + vEsc(e.kind) +
        (e.role && e.role !== e.kind ? ': ' + vEsc(e.role) : '') + per + '</span>';
      if (e.flag) html += ' <b style="color:var(--vgold)">[ellenőrizendő]</b>';
      html += '<br>' + (e.src ? '<a class="vlink" href="' + vEsc(e.src) + '" target="_blank" rel="noopener">forrás ↗</a>'
        : '<span style="color:var(--vmut)">nincs nyitható forrás</span>');
    }
    html += '</div>';
  });
  box.innerHTML = html;
  box.querySelectorAll('[data-vact]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.vact === 'cleartrail') vClearWalk();
  }));
}
function vSyncPathSel() {
  const sa = document.getElementById('vpatha'), sb = document.getElementById('vpathb');
  if (sa && VV.pathA) sa.value = VV.pathA;
  if (sb && VV.pathB) sb.value = VV.pathB;
}
function vFillPathSels() {
  const sa = document.getElementById('vpatha'), sb = document.getElementById('vpathb');
  if (!sa || !sb) return;
  const cos = [], pers = [];
  Object.keys(VG.nodes).forEach(id => {
    const n = VG.nodes[id];
    if (n.type === 'company' || n.type === 'collector') cos.push([id, n.label, n.totalHuf || 0]);
    else if (n.type === 'person') pers.push([id, n.label, 0]);
  });
  cos.sort((a, b) => b[2] - a[2]);
  pers.sort((a, b) => (a[1] < b[1] ? -1 : 1));
  const opts = '<optgroup label="Cégek">' + cos.slice(0, 300).map(c =>
    '<option value="' + vEsc(c[0]) + '">' + vEsc(c[1].slice(0, 50)) + '</option>').join('') + '</optgroup>' +
    '<optgroup label="Személyek">' + pers.map(c =>
    '<option value="' + vEsc(c[0]) + '">' + vEsc(c[1].slice(0, 50)) + '</option>').join('') + '</optgroup>';
  sa.innerHTML = opts; sb.innerHTML = opts;
}
function vFillYears() {
  const ys = document.getElementById('vyear');
  if (!ys) return;
  const cur = ys.value;
  ys.innerHTML = '<option value="">kikapcsolva</option>' + VG.years.map(y =>
    '<option value="' + y + '">' + y + '</option>').join('');
  if (cur) ys.value = cur;
}
function vSearch(q) {
  const box = document.getElementById('vsearchres');
  if (!box) return;
  q = String(q || '').trim().toLowerCase();
  if (q.length < 2) { box.innerHTML = ''; return; }
  const hits = [];
  Object.keys(VG.nodes).forEach(id => {
    const n = VG.nodes[id];
    if (n.type !== 'company' && n.type !== 'collector' && n.type !== 'person') return;
    if (n.label.toLowerCase().includes(q)) hits.push(n);
  });
  hits.sort((a, b) => a.label.length - b.label.length);
  box.innerHTML = hits.slice(0, 8).map(n =>
    '<button class="vbtn" data-vshow="' + vEsc(n.id) + '">' + vEsc(n.label.slice(0, 34)) + '</button>').join(' ') ||
    '<span style="font-size:12px;color:var(--vmut)">nincs találat</span>';
  box.querySelectorAll('[data-vshow]').forEach(b => b.addEventListener('click', () => vReveal(b.dataset.vshow)));
}
function vReveal(id) {
  if (!VG.nodes[id]) return;
  if (!VV.shown[id]) {
    VV.shown[id] = { id, x: 450, y: 310 };
    vExpand(id, false);
  }
  VV.sel = id;
  vRender();
  vPanel();
}
function vFit() {
  const svg = document.getElementById('vg');
  if (!svg) return;
  const ids = Object.keys(VV.shown);
  let to;
  if (!ids.length) {
    to = { x: 0, y: 0, w: 900, h: 620 };
  } else {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    ids.forEach(id => {
      const s = VV.shown[id];
      if (s.x < x0) x0 = s.x; if (s.y < y0) y0 = s.y;
      if (s.x > x1) x1 = s.x; if (s.y > y1) y1 = s.y;
    });
    const pad = 60;
    to = { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + pad * 2, h: (y1 - y0) + pad * 2 };
  }
  const from = VV.vb || { x: 0, y: 0, w: 900, h: 620 };
  VV.vb = to;
  if (typeof requestAnimationFrame === 'undefined') {
    vVbApply();
    vApplyVZ();
    return;
  }
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const step = now => {
    const t = Math.min(1, (now - t0) / 450);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    VV.vb = {
      x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e,
      w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e
    };
    vVbApply();
    vApplyVZ();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// Kliens-koordináta → SVG-lokális (viewport-helyes).
function vClientToLocal(cx, cy) {
  try {
    const svg = document.getElementById('vg');
    const pt = new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse());
    return { x: pt.x, y: pt.y };
  } catch (e) { return null; }
}
// Csomópont-húzás: rögzítés + könnyű újraszámítás + közvetlen DOM-frissítés.
function vDragStart(id) {
  const F = VV._lay;
  if (!F || !F.byNode[id]) return false;
  VV._drag = id;
  const n = F.byNode[id];
  n.fx = n.x; n.fy = n.y;
  return true;
}
function vDragTo(x, y) {
  const F = VV._lay;
  if (!F || !VV._drag) return false;
  const n = F.byNode[VV._drag];
  if (!n) return false;
  n.fx = x; n.fy = y; n.x = x; n.y = y;
  vLayout(F.nodes, F.epairs, 10);
  vTick();
  return true;
}
function vDragEnd() {
  const F = VV._lay;
  const id = VV._drag;
  VV._drag = null;
  if (!F || !id) return false;
  const n = F.byNode[id];
  if (n) {
    if (!VV.sel || VV.sel !== id) { n.fx = null; n.fy = null; }
    if (VV.shown[id]) { VV.shown[id].x = n.x; VV.shown[id].y = n.y; }
    vLayout(F.nodes, F.epairs, 25);
    vTick();
  }
  return true;
}
function vTick() {
  const F = VV._lay;
  if (!F) return;
  F.nodeEls.forEach(rec => {
    const n = F.byNode[rec.id];
    if (n) rec.el.setAttribute('transform', 'translate(' + n.x.toFixed(1) + ',' + n.y.toFixed(1) + ')');
  });
  F.edgeEls.forEach(rec => {
    const a = F.byNode[rec.a], b = F.byNode[rec.b];
    if (!a || !b) return;
    rec.el.setAttribute('x1', a.x.toFixed(1)); rec.el.setAttribute('y1', a.y.toFixed(1));
    rec.el.setAttribute('x2', b.x.toFixed(1)); rec.el.setAttribute('y2', b.y.toFixed(1));
  });
}
function vVbGet() {
  if (VV.vb) return VV.vb;
  return { x: 0, y: 0, w: 900, h: 620 };
}
function vVbApply() {
  const svg = document.getElementById('vg');
  if (svg && VV.vb) {
    svg.setAttribute('viewBox', VV.vb.x + ' ' + VV.vb.y + ' ' + VV.vb.w + ' ' + VV.vb.h);
  }
}
function vZoomAt(f, cx, cy) {
  const svg = document.getElementById('vg');
  if (!svg) return;
  const v = vVbGet();
  const k = 900 / v.w;
  const k2 = Math.min(3, Math.max(0.2, k * f));
  if (k2 === k) return;
  const nw = 900 / k2;
  const nh = nw * 620 / 900;
  let sx = v.x + v.w / 2, sy = v.y + v.h / 2;
  try {
    const pt = new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse());
    sx = pt.x; sy = pt.y;
  } catch (e) {}
  const lx = (sx - v.x) / v.w, ly = (sy - v.y) / v.h;
  VV.vb = { x: sx - lx * nw, y: sy - ly * nh, w: nw, h: nh };
  vVbApply();
  vApplyVZ();
}
function vFitAnimate() {
  vFit();
}
function vReset() {
  VV.shown = {}; VV.sedges = []; VV.expanded = {}; VV.projOf = {}; VV.rest = {};
  VV.sel = null; VV.pathA = null; VV.pathB = null; VV.path = null; VV.hidden = {};
  VV.trail = [];
  VV.vb = null;
  VV._needFull = true;
  const svg = document.getElementById('vg');
  if (svg) svg.setAttribute('viewBox', VB0);
  vSeed();
  vRender();
  vPanel();
}
function vSeed() {
  const mode = (VV.cfg && VV.cfg.startMode) || 'company';
  if (mode === 'person') return vSeedPersons();
  if (mode === 'project') return vSeedProjects();
  // Kezdőkép: CSAK a kijelölt cégek, +N jelvénnyel — kibontás csak kattintásra.
  const names = VV.start.length ? VV.start : VIZ_START.slice();
  const missing = [];
  names.forEach(nm => {
    const n = vNodeByLabel(nm);
    if (!n) { missing.push(nm); return; }
    if (VV.hidden[n.id]) return;
    VV.shown[n.id] = { id: n.id, x: 150 + Object.keys(VV.shown).length * 150, y: 310 };
  });
  const msg = document.getElementById('vmsg');
  if (msg && missing.length) msg.textContent = 'Ismeretlen kezdőcég: ' + missing.join(', ');
}
function vSeedPersons() {
  // Kezdőkép személy-módban: a legtöbb céget összefogó 8 személy, kibontatlanul.
  const pers = Object.keys(VG.nodes)
    .map(id => VG.nodes[id])
    .filter(n => n && n.type === 'person' && !VV.hidden[n.id]);
  pers.sort((a, b) => (vOrgCount(b.id) - vOrgCount(a.id)) ||
    String(a.label || '').localeCompare(String(b.label || ''), 'hu'));
  pers.slice(0, 8).forEach((n, i) => {
    VV.shown[n.id] = { id: n.id, x: 120 + i * 100, y: 310 };
  });
  const msg = document.getElementById('vmsg');
  if (msg) msg.textContent = pers.length
    ? 'Személy-kezdőkép: kattints egy személyre a cégeiért.'
    : 'Nincs személy a gráfban.';
}
function vSeedProjects() {
  // Kezdőkép projekt-módban: a legnagyobb EU + hazai projektek érméi a nyertes céggel.
  // Előző seed maradékainak takarítása (reset nem nyúl a VG.nodes-hoz).
  Object.keys(VG.nodes).forEach(k => {
    if (k.indexOf('j:start:') === 0) { delete VG.nodes[k]; delete VG.adj[k]; }
  });
  Object.keys(VG.adj).forEach(k => {
    const kept = (VG.adj[k] || []).filter(a => a.to.indexOf('j:start:') !== 0);
    if (kept.length !== (VG.adj[k] || []).length) VG.adj[k] = kept;
  });
  VV.seedLinked = {};
  const list = (VG.projTop || []).slice(0, 16);
  if (!list.length) {
    const msg = document.getElementById('vmsg');
    if (msg) msg.textContent = 'Nincs projekt-adat a gráfban.';
    return;
  }
  list.forEach((p, i) => {
    let coId = null;
    const hit = vNodeByLabel(p.winner || '');
    if (hit && (hit.type === 'company' || hit.type === 'collector')) {
      coId = hit.id;
    } else if (p.winner) {
      coId = 'c:start:' + vNormCo(p.winner).replace(/[^A-Z0-9]+/gi, '_').slice(0, 40);
      if (!VG.nodes[coId]) {
        VG.nodes[coId] = { id: coId, type: 'company', label: p.winner,
          totalHuf: p.amount_huf || null, projectCount: null, extended: true };
        VG.adj[coId] = VG.adj[coId] || [];
      }
    }
    if (!coId) return;
    if (!VV.shown[coId]) VV.shown[coId] = { id: coId, x: 120 + (i % 8) * 95, y: 180 + Math.floor(i / 8) * 280 };
    const pid = 'j:start:' + i;
    const px = VV.shown[coId].x, py = VV.shown[coId].y;
    const ang = (i / Math.max(1, list.length)) * Math.PI * 2;
    VV.shown[pid] = { id: pid, x: px + 90 * Math.cos(ang), y: py + 90 * Math.sin(ang) };
    VG.nodes[pid] = { id: pid, type: 'project',
      label: (p.source === 'ted' ? '🇭🇺 ' : '🇪🇺 ') + String(p.title || '').slice(0, 70),
      sub: vFmt(p.amount_huf), amountHuf: p.amount_huf, date: p.date,
      winner: p.winner || '', url: '', owners: [coId] };
    VV.sedges.push({ source: coId, target: pid, kind: 'projekt', role: 'nyertes projekt',
      amountHuf: p.amount_huf || 0, src: '' });
    // Resetek között a c:start csomópont megmarad — szomszédságot csak egyszer kötjük be.
    VV.seedLinked = VV.seedLinked || {};
    const lk = coId + '|' + pid;
    if (!VV.seedLinked[lk]) {
      VV.seedLinked[lk] = 1;
      const e = { source: coId, target: pid, kind: 'projekt', role: 'nyertes projekt',
        amountHuf: p.amount_huf || 0, src: '' };
      (VG.adj[coId] = VG.adj[coId] || []).push({ to: pid, e });
      (VG.adj[pid] = VG.adj[pid] || []).push({ to: coId, e });
    }
  });
  const msg = document.getElementById('vmsg');
  if (msg) msg.textContent = 'Projekt-kezdőkép: kattints egy érmére vagy cégre a folytatáshoz.';
}
async function vInit() {
  vInitTheme();
  vReadCfg();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  const setC = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  const c = VV.cfg;
  set('vsize', c.sizeMode); set('vshared', c.shared); set('vbridge', c.bridgeMin);
  set('vmaxn', c.maxNodes); set('vminamt', c.amountMin);
  setC('vsrc', c.onlySrc); setC('vflag', c.onlyFlag); setC('vcoll', c.collectors); setC('vbridges', c.bridgesOnly);
  const st = document.getElementById('vstart');
  if (st) st.value = VV.start.join(', ');
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { fn(el); vSaveCfg(); vRender(); vPanel(); });
  };
  bind('vsize', el => { VV.cfg.sizeMode = el.value; });
  bind('vshared', el => { VV.cfg.shared = Math.max(1, Number(el.value) || 1); });
  bind('vbridge', el => { VV.cfg.bridgeMin = Math.max(2, Number(el.value) || 2); });
  bind('vmaxn', el => { VV.cfg.maxNodes = Math.min(100, Math.max(5, Number(el.value) || 25)); });
  bind('vminamt', el => { VV.cfg.amountMin = Math.max(0, Number(el.value) || 0); });
  bind('vsrc', el => { VV.cfg.onlySrc = el.checked; });
  bind('vflag', el => { VV.cfg.onlyFlag = el.checked; });
  bind('vcoll', el => { VV.cfg.collectors = el.checked; });
  bind('vbridges', el => { VV.cfg.bridgesOnly = el.checked; });
  bind('vyear', el => { VV.cfg.year = el.value === '' ? null : Number(el.value); });
  const go = document.getElementById('vstartgo');
  if (go) go.addEventListener('click', () => {
    const el = document.getElementById('vstart');
    VV.start = String(el ? el.value : '').split(',').map(s => s.trim()).filter(Boolean);
    vSaveCfg(); vReset();
  });
  const syncModePills = () => {
    document.querySelectorAll('[data-vmode]').forEach(b =>
      b.classList.toggle('on', b.dataset.vmode === VV.cfg.startMode));
  };
  document.querySelectorAll('[data-vmode]').forEach(b => b.addEventListener('click', () => {
    if (VV.cfg.startMode === b.dataset.vmode) return;
    VV.cfg.startMode = b.dataset.vmode;
    syncModePills();
    vSaveCfg(); vReset();
  }));
  syncModePills();
  const pa = document.getElementById('vprojall');
  if (pa) pa.addEventListener('click', async () => {
    VV.cfg.projects = !VV.cfg.projects;
    pa.textContent = '🪙 Projektek: ' + (VV.cfg.projects ? 'BE' : 'KI') + ' (összes láthatón)';
    if (VV.cfg.projects) {
      const ids = Object.keys(VV.shown).filter(id => {
        const n = VG.nodes[id];
        return n && (n.type === 'company' || n.type === 'collector');
      }).slice(0, 12);
      let total = 0;
      for (let i = 0; i < ids.length; i++) {
        total += await vShowProjects(ids[i], true);
        if (total > 150) break;
      }
    } else {
      Object.keys(VV.projOf).forEach(k => {
        (VV.projOf[k] || []).forEach(pid => { delete VV.shown[pid]; delete VG.nodes[pid]; });
      });
      VV.projOf = {};
      VV.sedges = VV.sedges.filter(e => VV.shown[e.source] && VV.shown[e.target]);
    }
    vRender();
    vPanel();
    vFit();
  });
  const pg = document.getElementById('vpathgo');
  if (pg) pg.addEventListener('click', () => {
    const sa = document.getElementById('vpatha'), sb = document.getElementById('vpathb');
    VV.pathA = sa ? sa.value : null;
    VV.pathB = sb ? sb.value : null;
    vShowPath();
  });
  const ft = document.getElementById('vfit');
  if (ft) ft.addEventListener('click', vFit);
  const rs = document.getElementById('vreset');
  if (rs) rs.addEventListener('click', vReset);
  const svg = document.getElementById('vg');
  if (svg) {
    let panS = null, moved = 0, lastP = null;
    svg.addEventListener('mousedown', ev => {
      moved = 0;
      lastP = { x: ev.clientX, y: ev.clientY };
      const g = ev.target && ev.target.closest ? ev.target.closest('[data-vnode],[data-vmore]') : null;
      if (g && g.dataset.vnode) {
        vDragStart(g.dataset.vnode);
        panS = null;
      } else if (!g) {
        panS = { x: ev.clientX, y: ev.clientY };
      } else {
        panS = null;
      }
    });
    svg.addEventListener('mousemove', ev => {
      if (lastP) moved += Math.abs(ev.clientX - lastP.x) + Math.abs(ev.clientY - lastP.y);
      lastP = { x: ev.clientX, y: ev.clientY };
      if (VV._drag) {
        const pt = vClientToLocal(ev.clientX, ev.clientY);
        if (pt) vDragTo(pt.x, pt.y);
        return;
      }
      if (!panS) return;
      try {
        const r = svg.getBoundingClientRect();
        const v = vVbGet();
        const sc = r.width / v.w;
        v.x -= (ev.clientX - panS.x) / sc;
        v.y -= (ev.clientY - panS.y) / sc;
        VV.vb = v;
        panS = { x: ev.clientX, y: ev.clientY };
        vVbApply();
      } catch (e) {}
    });
    const endPan = () => { panS = null; vDragEnd(); };
    svg.addEventListener('mouseup', endPan);
    svg.addEventListener('mouseleave', endPan);
    svg.addEventListener('click', ev => {
      if (moved > 6) { try { ev.stopPropagation(); ev.preventDefault(); } catch (e) {} moved = 0; }
    }, true);
    svg.addEventListener('click', ev => {
      if (ev.target === svg && (VV.trail.length > 1 || VV.sel)) vClearWalk();
    });
    svg.addEventListener('wheel', ev => {
      try { ev.preventDefault(); } catch (e) {}
      vZoomAt(ev.deltaY < 0 ? 1.18 : 1 / 1.18, ev.clientX, ev.clientY);
    }, { passive: false });
    svg.addEventListener('dblclick', ev => {
      try { ev.preventDefault(); } catch (e) {}
      VV.vb = null;
      svg.setAttribute('viewBox', VB0);
      vApplyVZ();
    });
  }
  const se = document.getElementById('vsearch');
  if (se) se.addEventListener('input', () => vSearch(se.value));
  const build = document.getElementById('vbuild');
  try {
    await vLoad();
    if (build) build.textContent = '· gráf: ' + Object.keys(VG.nodes).length + ' pont';
    vFillYears();
    if (VV.cfg.year !== null && VV.cfg.year !== undefined && VV.cfg.year !== '') {
      const ys = document.getElementById('vyear');
      if (ys) ys.value = String(VV.cfg.year);
    }
    vFillPathSels();
    VV._needFull = true;
    vSeed();
    vRender();
    vPanel();
  } catch (e) {
    if (build) build.textContent = '· hiba: ' + e.message;
  }
}
window.__viz = {
  cfg: () => VV.cfg,
  graph: () => VG,
  shown: () => VV.shown,
  findPath: vFindPath,
  select: vNodeClick,
  expand: vExpand,
  pin: vTogglePin,
  pins: () => VV.pins,
  setMode: m => { if (/^(company|person|project)$/.test(m)) { VV.cfg.startMode = m; vReset(); } },
  showProjects: vShowProjects,
  seed: vSeed,
  render: vRender,
  panel: vPanel,
  reveal: vReveal,
  reset: vReset,
  dragStart: vDragStart,
  dragTo: vDragTo,
  dragEnd: vDragEnd,
  fit: vFit
};
vInit();

</script>
</body>
</html>`;
}
function renderIndexHtml() {
  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Közpénz- és Támogatási Térkép</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  body { background: #0b1220; color: #e2e8f0; }
  #map { height: 58vh; border-radius: 12px; border: 1px solid #1e293b; }
  .leaflet-popup-content-wrapper { background: #111c33; color: #e2e8f0; max-height: 340px; overflow: auto; }
  .leaflet-popup-tip { background: #111c33; }
  .leaflet-tooltip.town-tip { background: rgba(11,18,32,.94); border: 1px solid #475569; color: #e2e8f0; border-radius: 8px; padding: 6px 10px; max-height: 260px; overflow: auto; max-width: 320px; }
  .leaflet-tooltip.town-tip:before { display: none; }
  .town-tip ul { margin: 4px 0 0 0; padding-left: 16px; }
  .town-tip li { font-size: 12px; margin-bottom: 2px; }
  details.proj { border-top: 1px solid #334155; padding: 4px 0; font-size: 13px; }
  details.proj summary { cursor: pointer; font-weight: bold; }
  details.proj summary:hover { color: #7dd3fc; }
  input[type=range] { accent-color: #38bdf8; }
  .pill-active { background: #38bdf8 !important; color: #0b1220 !important; }
  .legend-swatch { display: inline-block; width: 18px; height: 12px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
  a.src-link { color: #7dd3fc; text-decoration: underline; }
  #halo [data-node] { cursor: pointer; }
  #halo [data-node]:hover circle { stroke: #ffffff; stroke-width: 3; }
  #halo [data-node]:hover text { fill: #ffffff; }
  #halo-vp[data-k="far"] .lyr-detail { display: none; }
  #halo-vp[data-k="mid"] .lyr-agg, #halo-vp[data-k="near"] .lyr-agg { display: none; }
  #halo-vp .lbl-mid { display: none; }
  #halo-vp[data-k="near"] .lbl-mid { display: inline; }
  #halo-vp .bubs { cursor: zoom-in; }
  #halo-vp .bubs:hover circle { stroke: #ffffff; }
  .halo-chip { background: #1e293b; border-radius: 9999px; padding: 4px 12px; font-size: 13px; }
  .halo-chip:hover { background: #38bdf8; color: #0b1220; }
  .halo-view-active { background: #38bdf8 !important; color: #0b1220 !important; font-weight: bold; }
  .xtab-active { background: #38bdf8 !important; color: #0b1220 !important; font-weight: bold; }
  table.xmatrix { border-collapse: collapse; font-size: 11px; }
  table.xmatrix th, table.xmatrix td { border: 1px solid #1e293b; padding: 2px 5px; white-space: nowrap; }
  table.xmatrix th { background: #1e293b; position: sticky; top: 0; }
  table.xmatrix td:first-child, table.xmatrix th:first-child { position: sticky; left: 0; background: #1e293b; z-index: 1; }
  .sticky-menu { position: sticky; top: 0; z-index: 1000; background: rgba(11,18,32,.95); padding: 8px 0; }
  .sticky-menu a { padding: 6px 12px; border-radius: 9999px; background: #1e293b; font-size: 13px; margin-right: 6px; display: inline-block; }
  .sticky-menu a:hover { background: #38bdf8; color: #0b1220; }
  table.data { width: 100%; font-size: 13px; border-collapse: collapse; }
  table.data th { text-align: left; padding: 6px 8px; background: #1e293b; cursor: pointer; white-space: nowrap; }
  table.data th:hover { color: #7dd3fc; }
  table.data td { padding: 6px 8px; border-top: 1px solid #334155; vertical-align: top; }
  table.data tr:hover td { background: #16213a; }
  details.sec > summary { cursor: pointer; font-size: 1.125rem; font-weight: bold; margin-bottom: .5rem; list-style: none; }
  details.sec > summary::-webkit-details-marker { display: none; }
  details.sec > summary:before { content: '▸ '; color: #38bdf8; }
  details.sec[open] > summary:before { content: '▾ '; }
  #app .bg-slate-800.rounded-lg.p-3 { padding: .5rem; }
  #app .mb-4 { margin-bottom: .75rem; }
  #app .mb-3 { margin-bottom: .5rem; }
  #app h1.text-2xl { font-size: 1.25rem; }
  .info-dot { display: inline-block; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 9999px; background: #1e293b; color: #7dd3fc; font-size: 12px; cursor: help; }
</style>
</head>
<body class="min-h-screen">
<div class="max-w-6xl mx-auto p-3" id="app">
  <h1 class="text-2xl font-bold mb-1">🗺️ Közpénz- és Támogatási Térkép</h1>
  <p class="text-sm text-slate-400 mb-2">Magyarországi EU-s támogatások, 46 ezer projekt — <span id="datasrc" class="italic">betöltés…</span></p>
  <nav class="sticky-menu mb-4">
    <a href="#sec-terkep">🗺️ Térkép</a><a href="#sec-cegek">🏢 Cégek</a><a href="#sec-szemelyek">🧍 Személyek</a><a href="#sec-felfedezo">🔎 Felfedező</a><a href="#sec-halo">🕸️ Cégháló</a><a href="#sec-diagramok">📊 Diagramok</a><a href="#sec-lista">📋 Böngészés</a>
  </nav>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
    <div class="bg-slate-800 rounded-lg p-3"><div class="text-xs text-slate-400">Összesen</div><div id="m-total" class="text-xl font-bold">–</div></div>
    <div class="bg-slate-800 rounded-lg p-3"><div class="text-xs text-slate-400">Projektek</div><div id="m-count" class="text-xl font-bold">–</div></div>
    <div class="bg-slate-800 rounded-lg p-3"><div class="text-xs text-slate-400">Település</div><div id="m-towns" class="text-xl font-bold">–</div></div>
    <div class="bg-slate-800 rounded-lg p-3"><div class="text-xs text-slate-400">Nyertes cég</div><div id="m-winners" class="text-xl font-bold">–</div></div>
  </div>

  <div class="flex flex-wrap items-center gap-2 mb-3">
    <button data-m="sum" class="pill-active px-3 py-1 rounded-full bg-slate-700 text-sm">💰 Összeg</button>
    <button data-m="percapita" class="px-3 py-1 rounded-full bg-slate-700 text-sm">🧍 Ft/fő</button>
    <span class="text-slate-400 text-sm ml-2">Forrás:</span>
    <button data-s="all" class="pill-active px-3 py-1 rounded-full bg-slate-700 text-sm">🌍 Összes</button>
    <button data-s="eu" class="px-3 py-1 rounded-full bg-slate-700 text-sm">🇪🇺 EU</button>
    <button data-s="ted" class="px-3 py-1 rounded-full bg-slate-700 text-sm">🇭🇺 Hazai</button>
  </div>

  <div id="sec-terkep"></div>
  <div id="map" class="mb-4"></div>

  <div class="bg-slate-800 rounded-lg p-3 mb-4">
    <div class="text-sm mb-2">🏆 Top lista — kattints egy sorra a nagyításhoz (<span id="towncount">0</span>)</div>
    <div id="towns" class="grid md:grid-cols-2 gap-2"></div>
  </div>

  <div class="bg-slate-800 rounded-lg p-3 mb-3">
    <label class="text-sm">Idővonal eddig: <span id="cutoff" class="font-bold text-sky-300">–</span></label>
    <input id="timeline" type="range" min="0" max="0" value="0" class="w-full">
    <div class="flex justify-between text-xs text-slate-400"><span id="datemin">–</span><span id="datemax">–</span></div>
  </div>

  <div class="bg-slate-800 rounded-lg p-3 mb-4 text-sm">
    <b>Jelmagyarázat (<span id="legendmode">összeg</span>):</b> <span id="legend"></span>
    <span class="info-dot" id="legendinfo" title="">ⓘ</span>
  </div>

  <div class="bg-slate-800 rounded-lg p-3 mb-3">
    <input id="q" list="qdatalist" type="text" placeholder="🔍 Keresés: település vagy cég neve…" autocomplete="off" class="bg-slate-900 rounded-lg px-3 py-2 text-sm w-full outline-none border border-slate-700 mb-2">
    <datalist id="qdatalist"></datalist>
    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
      <select id="county" class="bg-slate-900 rounded-lg px-2 py-2 text-sm border border-slate-700"><option value="">Megye: összes</option></select>
      <select id="personsel" class="bg-slate-900 rounded-lg px-2 py-2 text-sm border border-slate-700"><option value="">Személy: összes</option></select>
      <select id="sort" class="bg-slate-900 rounded-lg px-2 py-2 text-sm border border-slate-700">
        <option value="amount_desc">Rendezés: összeg ↓</option>
        <option value="date_desc">Rendezés: dátum ↓</option>
        <option value="name_asc">Rendezés: név A–Z</option>
      </select>
    </div>
    <div class="text-xs text-slate-400 mt-1">A kereső település- és cégnevekre illeszkedik (gépelés közben ajánl). Részletes projektszöveg-kereséshez használd a palyazat.gov.hu-t.</div>
  </div>

  <div id="sec-cegek"></div>
  <details class="sec mb-4" id="det-cegek"><summary class="text-lg font-bold mb-2">🏢 Cégek — top nyertesek (<span id="wincount">0</span>)</summary>
  <div class="bg-slate-800 rounded-lg p-3 mb-4 overflow-x-auto">
    <table class="data" id="ctable">
      <thead><tr>
        <th data-csort="name">Cég ▲▼</th><th data-csort="count">Projektek ▲▼</th><th data-csort="total">Összesen ▲▼</th>
        <th data-csort="avg">Átlag/projekt ▲▼</th><th data-csort="pcount">Személyek ▲▼</th><th>Kutatás</th>
      </tr></thead>
      <tbody id="cbody"><tr><td colspan="6" class="text-slate-400">Betöltés…</td></tr></tbody>
    </table>
    <div class="text-xs text-slate-400 mt-1">Top 2000 cég. Kattints egy sorra a cég projektjeiért.</div>
  </div>
  </details>

  <div id="sec-szemelyek"></div>
  <details class="sec mb-4" id="det-szemelyek"><summary class="text-lg font-bold mb-2">🧍 Személyek — kik vannak a cégekben (<span id="peoplecount">0</span>)</summary>
  <div class="text-xs text-slate-400 mb-2">*Projektjei/Összesen = a személy <b>összes</b> cégének projektjei együtt (kattints egy sorra a cégenkénti bontásért).</div>
  <div id="people" class="mb-4"></div>
  </details>

  <div id="sec-felfedezo"></div>
  <details class="sec mb-4" id="det-felfedezo" open><summary class="text-lg font-bold mb-2">🔎 Felfedező — három egyszerű út (<span id="xplrcount">…</span>)</summary>
  <div class="flex flex-wrap gap-2 mb-3">
    <button data-xtab="companies" class="halo-chip xtab-active">🏢 Cégek pénz szerint → kik voltak bennük?</button>
    <button data-xtab="persons" class="halo-chip">🧍 Személyek → mely cégekben?</button>
    <button data-xtab="matrix" class="halo-chip">▦ Mátrix: mindenki mindenkivel</button>
  </div>
  <div class="bg-slate-800 rounded-lg p-3 mb-2" id="xsearchbox">
    <input id="xq" type="text" placeholder="🔍 Keresés névben…" autocomplete="off" class="bg-slate-900 rounded-lg px-3 py-2 text-sm w-full outline-none border border-slate-700">
  </div>
  <div class="bg-slate-800 rounded-lg p-3 mb-2 overflow-x-auto"><div id="xlist" class="grid md:grid-cols-2 gap-2"></div></div>
  <div class="bg-slate-900 rounded-lg p-3 mb-2 text-sm" id="xdetail"><span class="text-slate-400">Válassz a listából — a részletek itt jelennek meg.</span></div>
  </details>

  <div id="sec-halo"></div>
  <h2 class="text-lg font-bold mb-2">Cégháló — összefonódások (<span id="halocount">0</span>)</h2>
  <div class="bg-slate-800 rounded-lg p-3 mb-2 text-sm text-slate-400">
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <button data-hview="cols" class="halo-chip">🧱 Rendezett (pénz szerint)</button>
      <button data-hview="force" class="halo-chip halo-view-active">🎨 Csoportos (közösségek)</button>
    </div>
    <div id="topcircles" class="flex flex-wrap gap-2 mt-2"></div>
    <span id="halodesc" style="display:none">Bal oldalt a cégek (méret = elnyert összeg), középen a TOP 200 beszerzés arany pöttyökként,
    jobb oldalt a személyek. Cégre vagy személyre kattintva a középső oszlop annak <b>összes</b> projektjére vált
    (a többi elhalványul). Újra kattintva visszaáll a TOP 200-ra.</span>
    <span id="halodesc-force">Szabad háló: <b>szín = cégcsoport</b> (közös személyek kötik össze),
    <b>kör = cég, négyzet = személy, kis pötty = beszerzés</b>, méret = elnyert összeg, élvastagság = pénz.
    Húzd a pontokat, vidd rájuk az egeret a nevekért, kattints a részletekért (a kiválasztott középre áll).
    <b>Görgővel zoom</b> a részletekbe, <b>háttér húzásával</b> minden irányba mozoghatsz,
    <b>dupla kattintásra</b> visszaáll az alapnézet.</span>
    <div class="mt-2 text-sm" id="signals"><b>🔎 Jelzések (mintázatok — nem bizonyítékok):</b>
      <label class="ml-2"><input type="checkbox" id="sig-strong"> 🔴 csak erős kötések (2+ közös cég)</label>
      <label class="ml-2"><input type="checkbox" id="sig-top"> 💰 csak top-3 pénzkör</label>
      <label class="ml-2"><input type="checkbox" id="sig-bridge"> 🟣 csak híd-személyek köre</label>
      <span class="text-slate-500" title="Ehhez cégadatok kellenének (Opten / e-cégjegyzék)">· <input type="checkbox" disabled> frissen alapított cég</span>
      <span class="text-slate-500" title="Ehhez székhely-adatok kellenének">· <input type="checkbox" disabled> azonos székhely</span>
      <span class="text-slate-500" title="Ehhez konzorciumi adatok kellenének">· <input type="checkbox" disabled> közös konzorcium</span>
    </div>
    <div id="bridges" class="mt-1"></div>
    <div id="communities" class="mt-1"></div>
  </div>
  <div class="bg-slate-800 rounded-lg p-3 mb-4 overflow-x-auto" style="position:relative">
    <div class="grid md:grid-cols-3 gap-3">
      <div class="md:col-span-2">
        <div id="halo"></div>
        <div class="flex flex-wrap items-center gap-2 mt-2 text-sm">
          <span class="text-slate-400">🧭 Kiindulás (3 út):</span>
          <a href="#" class="halo-chip" data-act="halo-chip" data-kind="project">🧾 Egy beszerzésből →</a>
          <a href="#" class="halo-chip" data-act="halo-chip" data-kind="person" data-nm="Magyar Állam">🧍 Egy személyből →</a>
          <a href="#" class="halo-chip" data-act="halo-chip" data-kind="company" data-nm="Nemzeti Infrastruktúra Fejlesztő Zrt.">🏢 Egy cégből →</a>
        </div>
      </div>
      <div>
        <div id="haloinfo" class="text-sm text-sky-300">Kattints egy cégre, projektre vagy személyre — a részletek itt, a gráf mellett jelennek meg.</div>
      </div>
    </div>
    <div id="halotip" style="display:none;position:fixed;z-index:2000;max-width:320px;background:rgba(11,18,32,.96);border:1px solid #38bdf8;color:#e2e8f0;border-radius:8px;padding:8px 10px;font-size:13px;pointer-events:none"></div>
  </div>

  <div id="sec-diagramok"></div>
  <details class="sec mb-4" id="det-sankey" open><summary class="text-lg font-bold mb-2">🌊 Pénzút — program → cég → tulajdonosi kör</summary>
  <div class="bg-slate-800 rounded-lg p-3 mb-2 text-sm text-slate-400">Top programok és nyerteseik; sávszélesség = Ft (top metszet). Kattints egy cégre a hálójáért.</div>
  <div class="bg-slate-800 rounded-lg p-3 mb-4 overflow-x-auto"><div id="sankey"></div></div>
  </details>
  <details class="sec mb-4" id="det-diagramok"><summary class="text-lg font-bold mb-2">📊 Diagramok</summary>
  <div class="bg-slate-800 rounded-lg p-3 mb-2">
    <div class="text-sm mb-1">Havi összesítés (Mrd Ft)</div>
    <div id="chart-monthly"></div>
  </div>
  <div class="bg-slate-800 rounded-lg p-3 mb-4">
    <div class="text-sm mb-1">Top település összesen (Mrd Ft)
      <select id="topn" class="bg-slate-900 rounded px-2 py-1 text-sm border border-slate-700 ml-2">
        <option value="5">Top 5</option>
        <option value="10" selected>Top 10</option>
        <option value="20">Top 20</option>
        <option value="50">Top 50</option>
        <option value="200">Top 200</option>
      </select>
    </div>
    <div id="chart-towns"></div>
  </div>
  </details>

  <div id="sec-lista"></div>
  <details class="sec mb-4" id="det-lista" open><summary class="text-lg font-bold mb-2">📋 Böngészés (<span id="listcount">0</span>)</summary>
  <div class="text-xs text-slate-400 mb-2" id="listinfo">A legnagyobb projektek.</div>
  <div class="flex items-center gap-2 mb-2 text-sm">
    <label for="minamt" class="text-slate-400">Min. összeg (Mrd Ft):</label>
    <input id="minamt" type="number" min="0" step="1" value="0" class="bg-slate-900 rounded px-2 py-1 text-sm border border-slate-700 w-28">
  </div>
  <div id="list" class="grid md:grid-cols-2 gap-2 pb-8"></div>
  </details>
</div>
<script>
const TOWN_POP = ${JSON.stringify(TOWN_POP)};

const map = L.map('map').setView([47.16, 19.50], 7);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri', maxZoom: 16
}).addTo(map);

// Adattár: aggregátumok induláskor, részletek kérésre (drill-down).
const BUILD = '20261007-v39-startmod-pin';
const DB = { towns: [], winners: [], monthly: {}, stats: null, people: [],
  townmonths: null, top: [], counties: [], months: [],
  tedTowns: [], tedWinners: [], tedMonthly: {}, tedTop: [], tedTownmonths: {} };
// Forrás-szűrő: 'all' | 'eu' | 'ted'. Csak rendezést és láthatóságot állít.
const SRC = { mode: 'all' };
try {
  const s = localStorage.getItem('kosszpenz-src');
  if (s === 'eu' || s === 'ted') SRC.mode = s;
} catch (e) {}
function srcTowns() {
  // EU + TED összesítés településenként (statikus összegek a diagramhoz).
  const m = {};
  (DB.towns || []).forEach(t => {
    m[t.name] = { name: t.name, county: t.county || '', lat: t.lat, lng: t.lng,
      eu: t.total || 0, eu_c: t.count || 0, ted: 0, ted_c: 0 };
  });
  (DB.tedTowns || []).forEach(t => {
    const e = m[t.name] = m[t.name] || { name: t.name, county: t.county || '', lat: t.lat, lng: t.lng,
      eu: 0, eu_c: 0, ted: 0, ted_c: 0 };
    e.ted = t.total || 0; e.ted_c = t.count || 0;
    if (e.lat == null) { e.lat = t.lat; e.lng = t.lng; }
    if (!e.county) e.county = t.county || '';
  });
  return Object.keys(m).map(k => {
    const e = m[k];
    e.total = (e.eu || 0) + (e.ted || 0);
    e.count = (e.eu_c || 0) + (e.ted_c || 0);
    return e;
  });
}
function winnersView() {
  // EU + TED nyertesek összefésülve, szűrő szerinti számokkal.
  const src = SRC.mode, m = {};
  (DB.winners || []).forEach(w => {
    m[normWinner(w.name)] = { name: w.name, eu: w.total || 0, eu_c: w.count || 0,
      ted: 0, ted_c: 0, first: w.first || '', last: w.last || '' };
  });
  (DB.tedWinners || []).forEach(w => {
    const k = normWinner(w.name);
    const e = m[k] = m[k] || { name: w.name, eu: 0, eu_c: 0, ted: 0, ted_c: 0, first: '', last: '' };
    e.ted = w.total || 0; e.ted_c = w.count || 0;
    if (!e.first || (w.first && w.first < e.first)) e.first = w.first || e.first;
    if (!e.last || (w.last && w.last > e.last)) e.last = w.last || e.last;
  });
  let rows = Object.keys(m).map(k => m[k]);
  if (src === 'eu') rows = rows.filter(r => r.eu > 0);
  else if (src === 'ted') rows = rows.filter(r => r.ted > 0);
  return rows.map(r => ({
    name: r.name, first: r.first, last: r.last,
    eu: r.eu, eu_c: r.eu_c, ted: r.ted, ted_c: r.ted_c,
    total: src === 'eu' ? r.eu : src === 'ted' ? r.ted : r.eu + r.ted,
    count: src === 'eu' ? r.eu_c : src === 'ted' ? r.ted_c : r.eu_c + r.ted_c
  }));
}
function monthlyView() {
  const src = SRC.mode, out = {};
  const add = mm => { for (const k in (mm || {})) out[k] = (out[k] || 0) + mm[k]; };
  if (src !== 'ted') add(DB.monthly);
  if (src !== 'eu') add(DB.tedMonthly);
  return out;
}
function topView() {
  // EU top + TED top összefésülve, összeg szerint (forrás-címkével).
  const src = SRC.mode;
  let arr = [];
  if (src !== 'ted') arr = arr.concat((DB.top || []).map(p => Object.assign({ source: 'eu' }, p)));
  if (src !== 'eu') arr = arr.concat((DB.tedTop || []).map(p => Object.assign({ source: 'ted' }, p)));
  return arr.sort((a, b) => b.amount_huf - a.amount_huf).slice(0, 200);
}
function srcBadge(p) {
  return (p && p.source) === 'ted' ? ' <span title="hazai közbeszerzés (TED)">🇭🇺</span>' : '';
}
let polyLayer = L.layerGroup().addTo(map);
let dotsLayer = L.layerGroup().addTo(map);
let metricMode = 'sum';
let cSort = { key: 'total', dir: -1 };
// Aktuális fúrás: {kind:'top'|'town'|'company'|'person', name?...}
let DRILL = { kind: 'top' };
const YLORRD = ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026'];
const NO_DATA = '#334155';
const fmtFt = n => (n / 1e9).toLocaleString('hu-HU', { maximumFractionDigits: 1 }) + ' Mrd Ft';
const fmtPerCapitaFull = n => Math.round(n).toLocaleString('hu-HU') + ' Ft/fő';
const monthKey = d => String(d || '').slice(0, 7);
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const srcLink = p => (p.url && (p.url.indexOf('http://') === 0 || p.url.indexOf('https://') === 0))
  ? '<br><a class="src-link" href="' + esc(p.url) + '" target="_blank" rel="noopener">📰 Forrás / cikk ↗</a>' : '';
const townOf = p => p.settlement || p.town || p.city;
function normWinner(w) {
  return String(w || '').toUpperCase().replace(/\s+/g, ' ')
    .replace(/\b(KFT|ZRT|BT|KKT|NYRT)\.?/g, '$1').replace(/[.\s]+$/, '').trim();
}
function hasGeo(p) {
  if (p.lat === undefined || p.lat === null || p.lat === '' ||
      p.lng === undefined || p.lng === null || p.lng === '') return false;
  return Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
}
function townValue(t) { return metricMode === 'percapita' && t.pop > 0 ? t.total / t.pop : t.total; }
function fmtMetric(v) { return metricMode === 'percapita' ? fmtPerCapitaFull(v) : fmtFt(v); }
function quantileBreaks(vals) {
  const s = vals.slice().sort((a, b) => a - b);
  if (!s.length) return [0, 0, 0, 0, 0, 1];
  const q = x => s[Math.min(s.length - 1, Math.floor(x * s.length))];
  return [s[0], q(0.2), q(0.4), q(0.6), q(0.8), s[s.length - 1]];
}
function classIndex(v, breaks) {
  for (let i = 1; i < breaks.length; i++) if (v <= breaks[i] || i === breaks.length - 1) return Math.min(4, i - 1);
  return 4;
}
function cegLinksByName(winner) {
  const q = encodeURIComponent('"' + winner + '" cég tulajdonos alapító');
  return '<br>🔍 Céginfó: <a class="src-link" href="https://www.google.com/search?q=' + q + '" target="_blank" rel="noopener">Google (tulajdonosi kör)</a>';
}
function projDetailsHtml(p, winnerName) {
  let known = '';
  try {
    const mine = (DB.people || []).filter(pp => normWinner(pp.company) === normWinner(winnerName));
    if (mine.length) {
      known = '<br>👥 Ismert személyek: ' + mine.map(pp =>
        esc(pp.name) + (pp.role ? ' (' + esc(pp.role) + ')' : '')).join(', ');
    }
  } catch (e) {}
  return '<b>' + esc(p.title) + '</b><br>' +
    '<b>' + fmtFt(p.amount_huf) + '</b> · ' + esc(p.date) + '<br>' +
    'Kedvezményezett: ' + esc(winnerName) +
    (p.programme ? '<br>Program: ' + esc(p.programme) : '') + srcLink(p) + cegLinksByName(winnerName) + known +
    '<br><a href="#" data-cojump="' + esc(winnerName) + '">🏢 Cégnézet: összes projektje →</a>';
}
function burstDots(projects, centerLat, centerLng) {
  dotsLayer.clearLayers();
  const withGeo = projects.filter(hasGeo).slice(0, 60);
  withGeo.forEach((p, i) => {
    const ang = (2 * Math.PI * i) / Math.max(1, withGeo.length);
    const rad = 0.012 + 0.004 * (i % 3);
    L.circleMarker([Number(centerLat) + rad * Math.sin(ang), Number(centerLng) + rad * Math.cos(ang) * 1.4], {
      radius: 7, color: '#0b1220', fillColor: '#38bdf8', fillOpacity: 0.95, weight: 2
    }).bindPopup(projDetailsHtml(p, p.winner)).addTo(dotsLayer);
  });
}
async function fetchSettlementProjects(name) {
  try {
    const r = await fetch('/api/settlement?name=' + encodeURIComponent(name)).then(r => r.json());
    return (r && r.projects) || [];
  } catch (e) { return []; }
}
async function fetchCompanyProjects(name) {
  try {
    const r = await fetch('/api/company?name=' + encodeURIComponent(name)).then(r => r.json());
    return { projects: (r && r.projects) || [], total: (r && (r.count || r.total)) || 0 };
  } catch (e) { return { projects: [], total: 0 }; }
}
function projRowHtml(p) {
  const st = p.settlement || p.town || p.city;
  const srcTag = (p && p.source) === 'ted'
    ? ' <span title="hazai közbeszerzés (TED)">🇭🇺</span>' : '';
  const kindTag = (p && p.source) === 'ted'
    ? (p.fund === 'EU' ? '🇪🇺 EU-s (TED) — ' : p.fund === 'hazai' ? '🇭🇺 Hazai közbeszerzés (TED) — ' : '🇭🇺 Közbeszerzés (TED) — ')
    : '🇪🇺 EU-s támogatás — ';
  return '<div class="bg-slate-800 rounded-lg p-3 text-sm"><b>' + esc(p.title) + '</b>' + srcTag +
    (hasGeo(p) ? '' : ' <span class="text-slate-400">[🗺️ térkép nélkül]</span>') + '<br>' +
    '<span class="text-slate-400">' + esc(st || '') + ' · ' + esc(p.date) + ' · ' + fmtFt(p.amount_huf) + '</span><br>' +
    '<span>' + kindTag + esc(p.winner) + '</span>' +
    srcLink(p) + cegLinksByName(p.winner) + '</div>';
}
async function setDrillCompany(name, detId, scrollId) {
  DRILL = { kind: 'company', name };
  document.getElementById('q').value = name;
  const ps = document.getElementById('personsel');
  if (ps) ps.value = '';
  if (detId) {
    const d = document.getElementById(detId);
    if (d) d.open = true;
  }
  await renderList();
  if (scrollId) document.getElementById(scrollId).scrollIntoView({ behavior: 'smooth' });
}
async function setDrillTown(name, detId, scrollId) {
  DRILL = { kind: 'town', name };
  document.getElementById('q').value = name;
  const ps = document.getElementById('personsel');
  if (ps) ps.value = '';
  if (detId) {
    const d = document.getElementById(detId);
    if (d) d.open = true;
  }
  await renderList();
  if (scrollId) document.getElementById(scrollId).scrollIntoView({ behavior: 'smooth' });
}
async function setDrillPerson(name) {
  DRILL = { kind: 'person', name };
  document.getElementById('q').value = '';
  await renderList();
  document.getElementById('sec-lista').scrollIntoView({ behavior: 'smooth' });
}
async function resolveSearch(q) {
  q = (q || '').trim();
  if (!q) { DRILL = { kind: 'top' }; await renderList(); return; }
  const ql = q.toLowerCase();
  const townHit = DB.towns.find(t => t.name.toLowerCase() === ql) ||
    DB.towns.find(t => t.name.toLowerCase().includes(ql));
  if (townHit) { await setDrillTown(townHit.name, 'det-lista', 'sec-lista'); return; }
  await setDrillCompany(q, 'det-lista', 'sec-lista');
}
function refreshDatalist() {
  const dl = document.getElementById('qdatalist');
  const towns = DB.towns.map(t => t.name);
  const comps = DB.winners.slice(0, 500).map(w => w.name);
  const seen = {};
  let html = '';
  towns.forEach(t => { if (!seen['t' + t]) { seen['t' + t] = 1; html += '<option value="' + esc(t) + '">🏘️ ' + esc(t) + '</option>'; } });
  comps.forEach(c => { if (!seen['c' + c]) { seen['c' + c] = 1; html += '<option value="' + esc(c) + '">🏢 ' + esc(c.slice(0, 60)) + '</option>'; } });
  dl.innerHTML = html;
}

// Települések az aktuális szűrőkkel (idővonal + megye + forrás).
function filteredTowns() {
  const months = window.__months || [];
  const cutoff = months[Number(document.getElementById('timeline').value)] || '9999-99';
  document.getElementById('cutoff').textContent = cutoff;
  const county = document.getElementById('county').value;
  const src = SRC.mode;
  const tmE = DB.townmonths || {}, tmT = DB.tedTownmonths || {};
  return srcTowns()
    .filter(t => !county || t.county === county)
    .map(t => {
      let eu = 0, ted = 0;
      const pe = tmE[t.name] || {}, pt = tmT[t.name] || {};
      for (const m in pe) {
        if (m <= cutoff) eu += pe[m];
      }
      for (const m in pt) {
        if (m <= cutoff) ted += pt[m];
      }
      const total = src === 'eu' ? eu : src === 'ted' ? ted : eu + ted;
      const count = src === 'eu' ? t.eu_c : src === 'ted' ? t.ted_c : t.eu_c + t.ted_c;
      return { name: t.name, county: t.county || '', total, count, lat: t.lat, lng: t.lng, pop: TOWN_POP[t.name] || 0 };
    })
    .filter(t => t.total > 0);
}

function renderDatasrc() {
  const stats = DB.stats || {};
  const hasTed = (stats.ted_rows || 0) > 0;
  const srcName = SRC.mode === 'eu' ? 'EU' : SRC.mode === 'ted' ? 'hazai' : 'EU + hazai';
  const el = document.getElementById('datasrc');
  if (el) el.textContent =
    (stats.total_rows || 0).toLocaleString('hu-HU') + ' EU-projekt' +
    (hasTed ? ' + ' + (stats.ted_rows || 0).toLocaleString('hu-HU') + ' hazai' : '') +
    ' (' + srcName + ' nézet), ' +
    fmtFt(stats.total_huf || 0) + (hasTed ? ' + ' + fmtFt(stats.ted_huf || 0) : '') +
    ' — élő adatbázisból · build ' + BUILD;
}
function render() {
  renderMap();
  renderWinners();
  renderPeople();
  renderHalo();
  renderCharts();
  renderList();
  renderSankey();
  renderXplorer();
}

function renderMap() {
  const towns = filteredTowns();
  polyLayer.clearLayers();
  dotsLayer.clearLayers();
  const zoom = (map && typeof map.getZoom === 'function') ? map.getZoom() : 7;
  // MEGYE-NÉZET (távolról): 19 megye + Budapest egy-egy pötty.
  // Kattintásra / nagyításra (zoom 9+) településszintre bomlik.
  if (zoom < 9) {
    const byCounty = {};
    towns.forEach(tn => {
      const c = tn.county || 'Ismeretlen';
      const e = byCounty[c] = byCounty[c] || { name: c, total: 0, count: 0, pop: 0, lat: 0, lng: 0, n: 0 };
      e.total += tn.total; e.count += tn.count; e.pop += tn.pop || 0;
      if (tn.lat != null && tn.lng != null) { e.lat += tn.lat; e.lng += tn.lng; e.n++; }
    });
    const counties = Object.keys(byCounty).map(k => {
      const e = byCounty[k];
      return { name: e.name, total: e.total, count: e.count, pop: e.pop,
        lat: e.n ? e.lat / e.n : null, lng: e.n ? e.lng / e.n : null };
    }).filter(c => c.lat != null);
    const cVals = counties.map(townValue);
    const cBreaks = quantileBreaks(cVals);
    const cMax = Math.max.apply(null, cVals.concat([1]));
    const t = towns.reduce((s, x) => s + x.total, 0);
    document.getElementById('m-total').textContent = fmtFt(t);
    document.getElementById('m-count').textContent = towns.reduce((s, x) => s + x.count, 0).toLocaleString('hu-HU') + ' projekt';
    document.getElementById('m-towns').textContent = counties.length + ' megye · ' + towns.length + ' település';
    document.getElementById('m-winners').textContent = winnersView().length + ' cég';
    document.getElementById('legendmode').textContent = (metricMode === 'percapita' ? 'egy főre' : 'összeg') + ' · megyék';
    const fmtB = v => metricMode === 'percapita' ? fmtPerCapitaFull(v) : fmtFt(v);
    document.getElementById('legend').innerHTML = YLORRD.map((c, i) =>
      '<span class="legend-swatch" style="background:' + c + '"></span>' +
      (i === 0 ? '≤ ' + fmtB(cBreaks[1]) : i === 4 ? '> ' + fmtB(cBreaks[4]) : fmtB(cBreaks[i]) + ' – ' + fmtB(cBreaks[i + 1]))
    ).join(' &nbsp; ');
    document.getElementById('legendinfo').title =
      'Megyénkénti összesítés (19 megye + Budapest egy-egy pötty, méret = elnyert összeg). ' +
      'Kattints egy pöttyre vagy nagyíts: közelről településszintre bomlik. ' +
      'Forrás: EU Kohesio 2014–2020 teljes magyar állomány (46 ezer projekt). EUR→HUF kb. 400-as árfolyamon.';
    counties.forEach(c => {
      const v = townValue(c);
      const ci = classIndex(v, cBreaks);
      const r = 12 + Math.sqrt(v / cMax) * 26;
      const tipHtml = '<b>' + esc(c.name) + '</b> — ' + fmtMetric(v) +
        '<br><span style="color:#94a3b8">' + c.count + ' projekt — kattints a nagyításhoz</span>';
      const lyr = L.circleMarker([c.lat, c.lng], {
        radius: r, color: '#38bdf8', fillColor: YLORRD[ci], fillOpacity: 0.85, weight: 2
      }).bindTooltip(tipHtml, { sticky: true, direction: 'top', className: 'town-tip' })
        .on('click', () => { try { map.flyTo([c.lat, c.lng], 9, { duration: 1.2 }); } catch (e) {} });
      lyr.addTo(dotsLayer);
    });
    const countyRows = counties.slice().sort((a, b) => b.total - a.total).slice(0, 10);
    document.getElementById('towncount').textContent = countyRows.length;
    document.getElementById('towns').innerHTML = countyRows.map((x, i) =>
      '<div class="bg-slate-800 rounded-lg p-3 text-sm cursor-pointer hover:bg-slate-700" data-county="' + esc(x.name) + '"><b>#' + (i + 1) + ' ' + esc(x.name) + '</b><br>' +
      '<span class="text-slate-400">' + fmtFt(x.total) + ' · ' + x.count + ' projekt' +
      (x.pop > 0 ? ' · ' + fmtPerCapitaFull(x.total / x.pop) : '') + '</span></div>'
    ).join('');
    document.querySelectorAll('[data-county]').forEach(el => el.addEventListener('click', () => {
      const c = counties.filter(cc => cc.name === el.dataset.county)[0];
      if (c) { try { map.flyTo([c.lat, c.lng], 9, { duration: 1.2 }); } catch (e) {} }
    }));
    return;
  }
  const withPop = towns.filter(t => metricMode !== 'percapita' || t.pop > 0);
  const vals = withPop.map(townValue);
  const breaks = quantileBreaks(vals);
  const NO_DATA = '#334155';
  const t = towns.reduce((s, x) => s + x.total, 0);
  window.__townBounds = window.__townBounds || {};
  document.getElementById('m-total').textContent = fmtFt(t);
  document.getElementById('m-count').textContent = towns.reduce((s, x) => s + x.count, 0).toLocaleString('hu-HU') + ' projekt';
  document.getElementById('m-towns').textContent = towns.length + ' település';
  document.getElementById('m-winners').textContent = DB.winners.length + ' cég';
  document.getElementById('legendmode').textContent = metricMode === 'percapita' ? 'egy főre' : 'összeg';
  const fmtB = v => metricMode === 'percapita' ? fmtPerCapitaFull(v) : fmtFt(v);
  document.getElementById('legend').innerHTML = YLORRD.map((c, i) =>
    '<span class="legend-swatch" style="background:' + c + '"></span>' +
    (i === 0 ? '≤ ' + fmtB(breaks[1]) : i === 4 ? '> ' + fmtB(breaks[4]) : fmtB(breaks[i]) + ' – ' + fmtB(breaks[i + 1]))
  ).join(' &nbsp; ') + ' &nbsp; <span class="legend-swatch" style="background:' + NO_DATA + '"></span>nincs adat';
  document.getElementById('legendinfo').title =
    'A település határa körbe van húzva, kitöltése a pénzt mutatja. ' +
    'Vidd rá a kurzort a projektjeiért, kattints: a pöttyök szétpattannak, válaszd ki amelyik érdekel ' +
    '(a részletek lenyithatók, a forráslink új fülön nyílik). ' +
    'Forrás: EU Kohesio 2014–2020 teljes magyar állomány (46 ezer projekt). ' +
    'EUR→HUF kb. 400-as árfolyamon.';
  const polyByName = {};
  if (DB.bounds) DB.bounds.features.forEach(f => {
    const nm = f.properties && f.properties.name;
    if (nm) (polyByName[nm] = polyByName[nm] || []).push(f);
  });
  towns.forEach(town => {
    const v = townValue(town);
    const gray = metricMode === 'percapita' && !(town.pop > 0);
    const ci = gray ? -1 : classIndex(v, breaks);
    const fill = gray ? NO_DATA : YLORRD[ci];
    const tipHtml = '<b>' + esc(town.name) + '</b> — ' + (gray ? 'nincs lakossági adat' : fmtMetric(v)) +
      '<br><span style="color:#94a3b8">' + town.count + ' projekt — kattints a projektekért</span>';
    const showProjects = () => {
      fetchSettlementProjects(town.name).then(projs => {
        projs = projs.slice().sort((a, b) => b.amount_huf - a.amount_huf);
        const top = projs.slice(0, 12).map(p =>
          '<li><b>' + esc(p.title.slice(0, 60)) + '</b> — ' + fmtFt(p.amount_huf) + '</li>').join('');
        const c = window.__townBounds[town.name];
        const center = c ? [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2] : [town.lat, town.lng];
        const popHtml = '<b>' + esc(town.name) + '</b> — ' + fmtFt(town.total) +
          '<br><span style="color:#94a3b8">' + projs.length + ' projekt</span>' +
          '<ul>' + top + '</ul>' +
          (projs.length > 12 ? '<div>…és még ' + (projs.length - 12) + '</div>' : '') +
          '<br><button data-act="list-town" data-cn="' + esc(town.name) + '" style="margin-top:6px;padding:6px 12px;border-radius:8px;background:#1e293b;font-weight:bold">📋 Összes listában</button>';
        if (center[0] != null) {
          L.popup().setLatLng(center).setContent(popHtml).openOn(map);
          burstDots(projs, center[0], center[1]);
        }
      });
    };
    const feats = polyByName[town.name] || [];
    if (feats.length) {
      feats.forEach(f => {
        const lyr = L.geoJSON(f, {
          style: { color: '#38bdf8', weight: 2, fillColor: fill, fillOpacity: gray ? 0.25 : 0.65 }
        }).bindTooltip(tipHtml, { sticky: true, direction: 'top', className: 'town-tip' })
          .on('click', showProjects);
        lyr.addTo(polyLayer);
        try {
          const b = lyr.getBounds();
          window.__townBounds[town.name] = [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]];
        } catch (e) {}
      });
    } else if (town.lat != null) {
      const lyr = L.circleMarker([town.lat, town.lng], {
        radius: 11, color: '#38bdf8', fillColor: fill, fillOpacity: gray ? 0.3 : 0.85, weight: 2
      }).bindTooltip(tipHtml, { sticky: true, direction: 'top', className: 'town-tip' })
        .on('click', showProjects);
      lyr.addTo(polyLayer);
      window.__townBounds[town.name] = [[town.lat - 0.05, town.lng - 0.05], [town.lat + 0.05, town.lng + 0.05]];
    }
  });
  // Top települések rangsor (kattintásra odarepül).
  const townRows = towns.map(tn => tn).sort((a, b) => b.total - a.total).slice(0, 10);
  document.getElementById('towncount').textContent = townRows.length;
  document.getElementById('towns').innerHTML = townRows.map((x, i) =>
    '<div class="bg-slate-800 rounded-lg p-3 text-sm cursor-pointer hover:bg-slate-700" data-town="' + esc(x.name) + '"><b>#' + (i + 1) + ' ' + esc(x.name) + '</b><br>' +
    '<span class="text-slate-400">' + fmtFt(x.total) + ' · ' + x.count + ' projekt' +
    (x.pop > 0 ? ' · ' + fmtPerCapitaFull(x.total / x.pop) : ' · nincs lakossági adat') + '</span></div>'
  ).join('');
  document.querySelectorAll('[data-town]').forEach(el => el.addEventListener('click', () => {
    const b = window.__townBounds[el.dataset.town];
    if (b) map.flyToBounds(b, { duration: 1 });
  }));
}

function renderWinners() {
  const personsOf = nk => (DB.people || []).filter(pp => normWinner(pp.company) === nk);
  const rows = winnersView().map(w => ({
    name: w.name, count: w.count, total: w.total, avg: w.total / Math.max(1, w.count),
    first: w.first || '', last: w.last || '',
    hasEu: (w.eu || 0) > 0 || (w.eu_count || 0) > 0, hasTed: (w.ted || 0) > 0 || (w.ted_count || 0) > 0,
    pcount: personsOf(normWinner(w.name)).length, pkey: normWinner(w.name)
  })).sort((a, b) => {
    const k = cSort.key, d = cSort.dir;
    const va = a[k], vb = b[k];
    return (typeof va === 'string' ? va.localeCompare(vb, 'hu') : va - vb) * d;
  }).slice(0, 200);
  document.getElementById('wincount').textContent = rows.length;
  document.getElementById('cbody').innerHTML = rows.map(r => {
    const ps = personsOf(r.pkey).map(pp =>
      '<div>👤 <b>' + esc(pp.name) + '</b>' + (pp.role ? ' <span class="text-slate-400">(' + esc(pp.role) + ')</span>' : '') + '</div>'
    ).join('') || '<span class="text-slate-500">–</span>';
    return '<tr data-winnerrow="' + esc(r.name) + '" style="cursor:pointer"><td><b>' + esc(r.name) + '</b>' +
    (r.hasTed && r.hasEu ? ' <span title="EU + hazai">🇪🇺🇭🇺</span>' : r.hasTed ? ' <span title="hazai közbeszerzés (TED)">🇭🇺</span>' : '') + '</td><td>' + r.count + '</td><td>' + fmtFt(r.total) + '</td>' +
    '<td>' + fmtFt(r.avg) + '</td><td>' + ps + '</td>' +
    '<td><a class="src-link" href="https://www.google.com/search?q=' + encodeURIComponent('"' + r.name + '" tulajdonos') + '" target="_blank" rel="noopener">Google</a></td></tr>';
  }).join('') || '<tr><td colspan="6" class="text-slate-400">Nincs találat.</td></tr>';
  document.querySelectorAll('[data-winnerrow]').forEach(tr => tr.addEventListener('click', ev => {
    if (ev.target && ev.target.tagName === 'A') return;
    setDrillCompany(tr.dataset.winnerrow, 'det-lista', 'sec-lista');
  }));
}

function renderPeople() {
  const compTotals = {};
  DB.winners.forEach(w => { compTotals[normWinner(w.name)] = { total: w.total, count: w.count }; });
  const personRows = DB.people.map(pp => {
    const myKeys = [...new Set(DB.people
      .filter(x => (x.name || '').trim().toLowerCase() === (pp.name || '').trim().toLowerCase())
      .map(x => normWinner(x.company)))];
    let count = 0, total = 0;
    myKeys.forEach(k => {
      const s = compTotals[k];
      if (s) { count += s.count; total += s.total; }
    });
    return { name: pp.name, company: pp.company, role: pp.role || '–', share: pp.share || '–',
      count, total, ncomp: myKeys.length };
  }).sort((a, b) => b.total - a.total).slice(0, 200);
  const peopleBox = document.getElementById('people');
  if (!personRows.length) {
    peopleBox.innerHTML = '<div class="bg-slate-800 rounded-lg p-3 text-sm text-slate-400">Még nincs személyi adat.</div>';
    document.getElementById('peoplecount').textContent = '0';
    return;
  }
  document.getElementById('peoplecount').textContent = DB.people.length;
  const pSortKey = (window.__pSort && window.__pSort.key) || 'total';
  const pSortDir = (window.__pSort && window.__pSort.dir) || -1;
  personRows.sort((a, b) => {
    const va = a[pSortKey], vb = b[pSortKey];
    return ((typeof va === 'string' ? va.localeCompare(vb, 'hu') : va - vb)) * pSortDir;
  });
  const pTh = (k, label) => '<th data-psort="' + k + '">' + label + ' ' +
    (pSortKey === k ? (pSortDir === 1 ? '▲' : '▼') : '▲▼') + '</th>';
  peopleBox.innerHTML = '<div class="bg-slate-800 rounded-lg p-3 overflow-x-auto"><div class="text-xs text-slate-400 mb-2">Kattints egy sorra: a személy cégeinek projektjei a listában.</div><table class="data"><thead><tr>' +
    pTh('name', 'Név') + pTh('role', 'Szerep') + pTh('company', 'Cég') + pTh('count', 'Projektjei*') +
    pTh('total', 'Összesen*') + pTh('share', 'Részesedés') + '<th>Forrás</th><th>Kutatás</th>' +
    '</tr></thead><tbody>' + personRows.map((r, idx) => {
    const src = ((DB.people.find(pp => pp.name === r.name) || {}).source) || '';
    return '<tr data-personexp="' + idx + '" style="cursor:pointer" title="Kattints a projektekért">' +
    '<td><b>▸ ' + esc(r.name) + '</b>' + (r.ncomp > 1 ? ' <span class="text-red-400 text-xs">[' + r.ncomp + ' cég]</span>' : '') + '</td><td>' + esc(r.role) + '</td><td>' + esc(r.company) + '</td>' +
    '<td>' + r.count + '</td><td>' + fmtFt(r.total) + '</td><td>' + esc(r.share) + '</td>' +
    '<td>' + (src ? '<a class="src-link" href="' + esc(src) + '" target="_blank" rel="noopener">link ↗</a>' : '<span class="text-slate-500">–</span>') + '</td>' +
    '<td><a class="src-link" href="https://www.google.com/search?q=' + encodeURIComponent('"' + r.name + '" cég tulajdonos alapító') + '" target="_blank" rel="noopener">Google</a></td></tr>';
  }).join('') + '</tbody></table></div>';
  peopleBox.querySelectorAll('[data-psort]').forEach(th => th.addEventListener('click', () => {
    const k = th.dataset.psort, cur = window.__pSort || { key: 'total', dir: -1 };
    window.__pSort = (cur.key === k) ? { key: k, dir: -cur.dir } : { key: k, dir: (k === 'name' || k === 'role' || k === 'company') ? 1 : -1 };
    renderPeople();
  }));
  peopleBox.querySelectorAll('[data-personexp]').forEach(tr => tr.addEventListener('click', ev => {
    if (ev.target && ev.target.tagName === 'A') return;
    const nm = tr.querySelector('td').textContent.replace(/^▸\s*/, '').replace(/\s*\[\d+ cég\]$/, '').trim();
    setDrillPerson(nm);
  }));
}

// --- Felfedező: 3 egyszerű út (cégek / személyek / mátrix) ---
let XT = { tab: 'companies', q: '' };
const xNormWinners = () => {
  const m = {};
  (DB.winners || []).forEach(w => { m[normWinner(w.name)] = w; });
  return m;
};
const xPersonsOfCompany = name => {
  const nk = normWinner(name);
  return (DB.people || []).filter(pp => normWinner(pp.company) === nk);
};
const xCompaniesOfPerson = name => {
  const nl = String(name || '').trim().toLowerCase();
  const seen = {}, out = [];
  (DB.people || []).forEach(pp => {
    if ((pp.name || '').trim().toLowerCase() !== nl) return;
    const c = pp.company || '';
    if (c && !seen[c]) { seen[c] = 1; out.push(c); }
  });
  return out;
};
const xBindJumps = box => {
  box.querySelectorAll('[data-xcojump]').forEach(el => el.addEventListener('click', ev => {
    ev.preventDefault(); XT.tab = 'companies'; renderXplorer(); xSelectCompany(el.dataset.xcojump);
    document.getElementById('sec-felfedezo').scrollIntoView({ behavior: 'smooth' });
  }));
  box.querySelectorAll('[data-xpjump]').forEach(el => el.addEventListener('click', ev => {
    ev.preventDefault(); XT.tab = 'persons'; renderXplorer(); xSelectPerson(el.dataset.xpjump);
    document.getElementById('sec-felfedezo').scrollIntoView({ behavior: 'smooth' });
  }));
};
function renderXplorer() {
  document.querySelectorAll('[data-xtab]').forEach(b => {
    if (b.dataset.xtab === XT.tab) b.classList.add('xtab-active');
    else b.classList.remove('xtab-active');
  });
  const sb = document.getElementById('xsearchbox');
  if (sb) sb.style.display = XT.tab === 'matrix' ? 'none' : '';
  if (XT.tab === 'matrix') renderXMatrix();
  else renderXList();
  const xc = document.getElementById('xplrcount');
  if (xc) xc.textContent = XT.tab === 'companies' ? 'cégek pénz szerint'
    : XT.tab === 'persons' ? 'személyek' : 'mátrix';
}
function renderXList() {
  const box = document.getElementById('xlist');
  if (!box) return;
  const q = XT.q.trim().toLowerCase();
  let html = '';
  if (XT.tab === 'companies') {
    const rows = DB.winners.slice(0, 200).filter(w => !q || w.name.toLowerCase().includes(q));
    html = rows.map(w => {
      const np = xPersonsOfCompany(w.name).length;
      return '<div class="bg-slate-800 rounded-lg p-3 text-sm cursor-pointer hover:bg-slate-700" data-xco="' + esc(w.name) + '">' +
        '<b>' + esc(w.name) + '</b><br><span class="text-slate-400">' + fmtFt(w.total) + ' · ' + w.count +
        ' projekt · 👤 ' + np + ' személy</span></div>';
    }).join('') || '<div class="text-slate-400 text-sm">Nincs találat.</div>';
  } else {
    const byName = {};
    (DB.people || []).forEach(pp => {
      const nm = pp.name || '';
      byName[nm] = byName[nm] || { name: nm, comps: {}, role: '' };
      if (pp.company) byName[nm].comps[pp.company] = 1;
      if (pp.role && !byName[nm].role) byName[nm].role = pp.role;
    });
    const rows = Object.keys(byName).map(k => ({ name: k, n: Object.keys(byName[k].comps).length, role: byName[k].role }))
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'hu')).slice(0, 200);
    html = rows.map(r =>
      '<div class="bg-slate-800 rounded-lg p-3 text-sm cursor-pointer hover:bg-slate-700" data-xp="' + esc(r.name) + '">' +
      '<b>' + esc(r.name) + '</b>' + (r.n > 1 ? ' <span class="text-red-400 text-xs">[' + r.n + ' cég]</span>' : '') +
      '<br><span class="text-slate-400">' + r.n + ' cég' + (r.role ? ' · ' + esc(r.role.slice(0, 50)) : '') + '</span></div>'
    ).join('') || '<div class="text-slate-400 text-sm">Nincs találat.</div>';
  }
  box.innerHTML = html;
  box.querySelectorAll('[data-xco]').forEach(el => el.addEventListener('click', () => xSelectCompany(el.dataset.xco)));
  box.querySelectorAll('[data-xp]').forEach(el => el.addEventListener('click', () => xSelectPerson(el.dataset.xp)));
}
async function xSelectCompany(name) {
  const box = document.getElementById('xdetail');
  if (!box) return;
  const W = xNormWinners()[normWinner(name)];
  const persons = xPersonsOfCompany(name);
  box.innerHTML = '<b>🏢 ' + esc(name) + '</b><br><span class="text-slate-400">' +
    (W ? fmtFt(W.total) + ' · ' + W.count + ' projekt' : 'összesítés készül…') + ' · 👤 ' +
    persons.length + ' ismert személy</span><br><span class="text-slate-400">Projektek betöltése…</span>';
  let projs = [], total = (W && W.count) || 0;
  try {
    const r = await fetch('/api/company?name=' + encodeURIComponent(name)).then(r => r.json());
    projs = (r && r.projects) || [];
    total = (r && (r.count || r.total)) || projs.length;
  } catch (e) {}
  const pHtml = persons.length ? persons.map(pp =>
    '<div>👤 <a href="#" data-xpjump="' + esc(pp.name) + '" class="src-link"><b>' +
    esc(pp.name) + '</b></a>' + (pp.role ? ' <span class="text-slate-400">(' + esc(pp.role) + ')</span>' : '') +
    (pp.source ? ' <a class="src-link" href="' + esc(pp.source) + '" target="_blank" rel="noopener">forrás ↗</a>' : '') + '</div>'
  ).join('') : '<span class="text-slate-500">Ehhez a céghez még nincs feltöltött személy — egy cég önmagában még nem jelzés.</span>';
  box.innerHTML = '<b>🏢 ' + esc(name) + '</b><br><span class="text-slate-400">' +
    (W ? fmtFt(W.total) + ' · ' : '') + total + ' projekt · 👤 ' + persons.length + ' ismert személy</span>' +
    '<div class="mt-2"><b>👥 Kik voltak benne (' + persons.length + '):</b><br>' + pHtml + '</div>' +
    (projs.length ? '<div class="mt-2 text-slate-400">Top projektek:<br>' + projs.slice().sort((a, b) => b.amount_huf - a.amount_huf).slice(0, 5).map(p =>
      '• ' + esc(String(p.title || '').slice(0, 55)) + ' (' + fmtFt(p.amount_huf) + ')').join('<br>') + '</div>' : '') +
    '<div class="mt-2"><a href="#" data-act="halo-select-company" data-nm="' + esc(name) + '" class="src-link">🕸️ Mutat a hálóban →</a></div>' +
    HALO_DISCLAIMER;
  xBindJumps(box);
}
async function xSelectPerson(name) {
  const box = document.getElementById('xdetail');
  if (!box) return;
  const comps = xCompaniesOfPerson(name);
  const W = xNormWinners();
  let tot = 0;
  comps.forEach(c => { const w = W[normWinner(c)]; if (w) tot += w.total; });
  box.innerHTML = '<b>🧍 ' + esc(name) + '</b> — ' + comps.length + ' cégben' +
    (tot ? ' · ' + fmtFt(tot) : '') +
    '<div class="mt-2"><b>🏢 Mely cégekben:</b><br>' +
    (comps.length ? comps.map(c => {
      const w = W[normWinner(c)];
      return '<div>🏢 <a href="#" data-xcojump="' + esc(c) + '" class="src-link"><b>' +
        esc(c) + '</b></a> <span class="text-slate-400">(' + (w ? fmtFt(w.total) + ' · ' + w.count + ' projekt' : 'részletek a cégnél') + ')</span></div>';
    }).join('') : '<span class="text-slate-500">Nincs cégkapcsolat.</span>') + '</div>' +
    '<div class="mt-2"><a href="#" data-act="halo-select-person" data-nm="' + esc(name) + '" class="src-link">🕸️ Mutat a hálóban →</a></div>' +
    HALO_DISCLAIMER;
  xBindJumps(box);
}
function renderXMatrix() {
  const box = document.getElementById('xlist');
  const det = document.getElementById('xdetail');
  if (!box) return;
  const coP = {};
  (DB.people || []).forEach(pp => {
    if (!pp.company) return;
    coP[pp.company] = coP[pp.company] || {};
    coP[pp.company][pp.name] = 1;
  });
  const cols = Object.keys(coP).sort((a, b) => Object.keys(coP[b]).length - Object.keys(coP[a]).length).slice(0, 60);
  const pCount = {};
  (DB.people || []).forEach(pp => {
    pCount[pp.name] = pCount[pp.name] || {};
    if (pp.company) pCount[pp.name][pp.company] = 1;
  });
  const rows = Object.keys(pCount).sort((a, b) => Object.keys(pCount[b]).length - Object.keys(pCount[a]).length);
  box.innerHTML = '<div class="md:col-span-2 overflow-x-auto"><div class="text-xs text-slate-400 mb-2">' +
    rows.length + ' személy × ' + cols.length + ' cég (a legtöbb személyű cégek). ● = kapcsolat — kattints a névre a részletekért.</div>' +
    '<table class="xmatrix"><thead><tr><th></th>' + cols.map(c =>
      '<th><a href="#" data-xcojump="' + esc(c) + '" class="src-link" title="' + esc(c) + '">' + esc(c.slice(0, 14)) + '</a></th>').join('') +
    '</tr></thead><tbody>' + rows.map(nm =>
      '<tr><td><a href="#" data-xpjump="' + esc(nm) + '" class="src-link" title="' + esc(nm) + '"><b>' + esc(nm.slice(0, 16)) + '</b></a> <span class="text-slate-500">(' + Object.keys(pCount[nm]).length + ')</span></td>' +
      cols.map(c => '<td class="text-center" title="' + esc(nm) + ' × ' + esc(c) + '">' +
        (pCount[nm][c] ? '<span style="color:#38bdf8">●</span>' : '<span class="text-slate-700">·</span>') + '</td>').join('') + '</tr>'
    ).join('') + '</tbody></table></div>';
  if (det) det.innerHTML = '<span class="text-slate-400">A mátrix az összes ismert személy–cég kapcsolatot mutatja egyben. Sűrű ●-csoport = összetartó kör. Egy közös cég még nem jelzés — a 2+ közös cég az.</span>';
  xBindJumps(box);
}
window.__xplr = {
  render: renderXplorer,
  company: xSelectCompany,
  person: xSelectPerson,
  tab: t => { XT.tab = t; renderXplorer(); },
  state: XT
};

async function renderList() {
  const box = document.getElementById('list');
  const info = document.getElementById('listinfo');
  const sortMode = document.getElementById('sort').value;
  const minAmt = Number(document.getElementById('minamt').value || 0) * 1e9;
  const sorter = (a, b) =>
    sortMode === 'date_desc' ? (a.date < b.date ? 1 : -1) :
    sortMode === 'name_asc' ? a.title.localeCompare(b.title, 'hu') :
    b.amount_huf - a.amount_huf;
  const applyMin = ps => ps.filter(p => (p.amount_huf || 0) >= minAmt);
  let projs = [], label = '';
  if (DRILL.kind === 'town') {
    projs = await fetchSettlementProjects(DRILL.name);
    label = 'Település: ' + DRILL.name + ' — ' + projs.length + ' projekt. Kattints a térképen is a pöttyökért.';
  } else if (DRILL.kind === 'company') {
    const r = await fetchCompanyProjects(DRILL.name);
    projs = r.projects;
    label = 'Cég: ' + DRILL.name + ' — ' + (r.total || projs.length) + ' projekt.';
  } else if (DRILL.kind === 'person') {
    const comps = [...new Set((DB.people || [])
      .filter(pp => (pp.name || '').trim() === DRILL.name)
      .map(pp => pp.company))];
    let all = [];
    for (const c of comps.slice(0, 8)) {
      try {
        const r = await fetch('/api/company?name=' + encodeURIComponent(c)).then(r => r.json());
        if (r && r.projects) all = all.concat(r.projects);
      } catch (e) {}
    }
    projs = all;
    label = 'Személy: ' + DRILL.name + ' — ' + projs.length + ' projekt ' + comps.length + ' cégben.';
  } else {
    projs = topView();
    label = 'A legnagyobb projektek' + (SRC.mode === 'eu' ? ' (EU).' : SRC.mode === 'ted' ? ' (hazai).' : ' (EU + hazai).') + ' Válassz települést, céget vagy személyt a szűkítéshez.';
  }
  projs = applyMin(projs.slice().sort(sorter));
  document.getElementById('listcount').textContent = projs.length;
  info.textContent = label;
  const shown = projs.slice(0, 60);
  box.innerHTML = shown.map(projRowHtml).join('') + (projs.length > 60
    ? '<div class="text-sm text-slate-400 p-2">…és még ' + (projs.length - 60) + ' projekt.</div>'
    : '');
}

// Közösségek: cégek + személyek összefüggő komponensei a közös személyeken át.
// (InMaps-szerű színezés alapja: egy szín = egy összetartó cégcsoport.)
const COMM_COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
const COMM_GRAY = '#64748b';
// Semleges megfogalmazás: jelzés ≠ bizonyíték (jogi óvatosság névvel szereplőknél).
const HALO_DISCLAIMER = '<div class="text-slate-400 text-xs mt-2">A jelzések összefüggéseket mutatnak, ' +
  'önmagukban nem bizonyítanak semmit. Adatforrás: EU Kohézió 2014–2020 + kézi cégkutatás (forráslinkekkel).</div>';
// Mini idővonal: projektek havi bontásban (cégalapítás-dátum nincs az adatokban).
function haloTimelineHtml(projs) {
  const byM = {};
  (projs || []).forEach(p => {
    const m = String(p.date || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) byM[m] = (byM[m] || 0) + 1;
  });
  const ks = Object.keys(byM).sort().slice(-36);
  if (!ks.length) return '';
  const mx = Math.max.apply(null, ks.map(k => byM[k]));
  return '<div class="mt-2"><div class="text-xs text-slate-400 mb-1">⏳ Projektek időben ' +
    '(cégalapítás-dátum nem áll rendelkezésre):</div>' +
    '<div class="flex items-end gap-px" style="height:44px">' + ks.map(k =>
      '<div title="' + k + ': ' + byM[k] + ' projekt" style="flex:1;background:#38bdf8;min-height:3px;height:' +
      Math.max(8, byM[k] / mx * 100) + '%"></div>').join('') + '</div>' +
    '<div class="flex justify-between text-xs text-slate-500"><span>' + ks[0] + '</span><span>' + ks[ks.length - 1] + '</span></div></div>';
}
// Személy×cég mátrix sűrű csoportokhoz (a háló gombolyaggá válna helyette).
function haloMatrixHtml(colKeys, rowKeys, compTotals, personComps) {
  colKeys = (colKeys || []).slice(0, 15);
  rowKeys = (rowKeys || []).slice(0, 15);
  if (!colKeys.length || !rowKeys.length) return '';
  const cell = (ck, rk) => ((personComps[rk] || {}).comps || {})[ck]
    ? '<span title="kapcsolat">●</span>' : '<span class="text-slate-600">·</span>';
  return '<div class="mt-2 overflow-x-auto"><div class="text-xs text-slate-400 mb-1">▦ Személy × cég mátrix:</div>' +
    '<table class="data"><thead><tr><th></th>' + colKeys.map(ck =>
      '<th title="' + esc((compTotals[ck] || {}).name || ck) + '">' +
      esc(String((compTotals[ck] || {}).name || ck).slice(0, 12)) + '</th>').join('') +
    '</tr></thead><tbody>' + rowKeys.map(rk =>
      '<tr><td title="' + esc((((personComps[rk] || {}).name)) || rk) + '"><b>' +
      esc(String(((personComps[rk] || {}).name) || rk).slice(0, 14)) + '</b></td>' +
      colKeys.map(ck => '<td class="text-center">' + cell(ck, rk) + '</td>').join('') + '</tr>'
    ).join('') + '</tbody></table></div>';
}
// Szemantikus zoom-szintek a nézeti nagyításból: távolról csak
// közösség-buborékok, középen a pontok, közelről a plusz feliratok is.
function haloVpLevelOf(k) { return k < 1.5 ? 'far' : (k > 2.5 ? 'near' : 'mid'); }
function haloCommunities(compTotals, personComps) {
  const parent = {};
  const find = x => {
    parent[x] = parent[x] || x;
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };
  const union = (a, b) => { parent[find(a)] = find(b); };
  Object.keys(compTotals).forEach(k => find('c:' + k));
  Object.keys(personComps).forEach(pk => {
    find('p:' + pk);
    Object.keys(personComps[pk].comps).forEach(ck => union('p:' + pk, 'c:' + ck));
  });
  const size = {};
  Object.keys(parent).forEach(x => { const r = find(x); size[r] = (size[r] || 0) + 1; });
  const rank = {};
  Object.keys(size).sort((a, b) => size[b] - size[a]).forEach((r, i) => { rank[r] = i; });
  const colorOf = key => {
    const r = find(key);
    if (!(r in rank)) return COMM_GRAY;
    const i = rank[r];
    return COMM_COLORS[i % COMM_COLORS.length];
  };
  return { colorOf, compSize: size, compRank: rank, rootOf: find };
}

function renderHalo() {
  const box = document.getElementById('halo');
  const info = document.getElementById('haloinfo');
  const bBox = document.getElementById('bridges');
  const compTotals = {};
  DB.winners.slice(0, 400).forEach(w => {
    compTotals[normWinner(w.name)] = { name: w.name, total: w.total, count: w.count };
  });
  const personComps = {};
  (DB.people || []).forEach(pp => {
    const cnk = normWinner(pp.company);
    if (!compTotals[cnk]) return;
    const pk = (pp.name || '').trim().toLowerCase();
    const e = personComps[pk] = personComps[pk] || { name: pp.name, role: pp.role, comps: {} };
    e.comps[cnk] = true;
    if ((pp.name || '').length >= (e.name || '').length) e.name = pp.name;
  });
  const pKeys = Object.keys(personComps);
  // Híd-cégek (több cégben szereplő személy köti össze őket) előre sorolva.
  const bridgeCo = {};
  pKeys.forEach(pk => {
    const cs = Object.keys(personComps[pk].comps);
    if (cs.length > 1) cs.forEach(k => { bridgeCo[k] = true; });
  });
  let cKeys = Object.keys(compTotals).filter(k =>
    pKeys.some(pk => personComps[pk].comps[k]));
  cKeys = cKeys
    .map(k => ({ k, t: compTotals[k].total, b: bridgeCo[k] ? 1 : 0 }))
    .sort((a, b) => ((b.b - a.b) || (b.t - a.t))).slice(0, 200).map(x => x.k);
  const bridges = pKeys.filter(pk => Object.keys(personComps[pk].comps).length > 1);
  // Erős kötések: 2+ közös cég két személy között (mintázat!). Egyszer számolva,
  // a lista és mindkét nézet használja. (pKeys sorrend = későbbi pSorted alapja előtt.)
  const strongPairs = [];
  for (let a = 0; a < pKeys.length; a++) {
    const ca = personComps[pKeys[a]].comps;
    for (let b = a + 1; b < pKeys.length; b++) {
      const cb = personComps[pKeys[b]].comps;
      let nshr = 0;
      const keysA = Object.keys(ca), keysB = Object.keys(cb);
      const small = keysA.length < keysB.length ? ca : cb;
      const big = small === ca ? cb : ca;
      for (const k in small) if (big[k]) nshr++;
      if (nshr >= 2) strongPairs.push({ pa: pKeys[a], pb: pKeys[b], n: nshr });
    }
  }
  // Középső oszlop: alapból a TOP 200; cég/személy kattintásra annak összes projektje.
  const TOP_MID_N = 200, MID_CAP = 300;
  const jList = DB.top.slice(0, TOP_MID_N);
  document.getElementById('halocount').textContent = cKeys.length + ' cég, ' + pKeys.length + ' személy, ' + jList.length + ' beszerzés';
  if (!cKeys.length) {
    box.innerHTML = '<div class="text-sm text-slate-400">Nincs megjeleníthető kapcsolat. Tölts be személyi adatokat (Személyek nézet).</div>';
    bBox.innerHTML = ''; info.textContent = 'Kattints egy cégre, projektre vagy személyre.';
    window.__halo = window.__halo || {};
    window.__halo.data = null;
    return;
  }
  bBox.innerHTML = bridges.length
    ? '<b>Hidak (' + bridges.length + '):</b> ' + bridges.map(pk =>
      '<a href="#" data-bridge="' + esc(pk) + '" class="src-link">' + esc(personComps[pk].name) +
      ' (' + Object.keys(personComps[pk].comps).length + ' cég)</a>').join(' · ')
    : '<span class="text-slate-500">Nincs több cégben szereplő személy a szűrőkre.</span>';
  if (strongPairs.length) {
    bBox.innerHTML += '<div class="mt-1"><b>🔴 Erős kötések (2+ közös cég — mintázat):</b> ' +
      strongPairs.slice(0, 12).map(sp =>
        '<a href="#" data-act="halo-select-person" data-nm="' + esc(personComps[sp.pa].name) + '" class="src-link">' +
        esc(personComps[sp.pa].name) + '</a> ↔ ' +
        '<a href="#" data-act="halo-select-person" data-nm="' + esc(personComps[sp.pb].name) + '" class="src-link">' +
        esc(personComps[sp.pb].name) + '</a> (' + sp.n + ')'
      ).join(' · ') + (strongPairs.length > 12 ? ' …(+' + (strongPairs.length - 12) + ')' : '') + '</div>';
  }
  const W = 900, rowH = 26;
  const cSorted0 = cKeys.map(k => ({ k, t: compTotals[k].total })).sort((a, b) => b.t - a.t).map(x => x.k);
  const pSorted0 = pKeys.slice().sort((a, b) => {
    const ca = Object.keys(personComps[a].comps).length, cb = Object.keys(personComps[b].comps).length;
    if (cb !== ca) return cb - ca;
    return a < b ? -1 : 1;
  });
  const defaultMid = () => ({ projects: DB.top.slice(0, TOP_MID_N),
    label: 'TOP ' + TOP_MID_N + ' beszerzés', total: DB.top.length,
    hidden: Math.max(0, DB.top.length - TOP_MID_N) });
  window.__halo = window.__halo || {};
  if (!window.__halo.view) window.__halo.view = 'force';
  window.__halo.strongPairs = strongPairs;
  window.__halo.data = { compTotals, personComps, cSorted: cSorted0, pSorted: pSorted0,
    comm: haloCommunities(compTotals, personComps) };
  window.__halo.mid = defaultMid();
  window.__halo.sel = null;
  info.textContent = 'Kattints egy cégre, projektre vagy személyre.';
  // Top-10 kör kártyák (belépési pontok keresőmező helyett): pénz szerint.
  // (Init után: window.__halo.data.comm már él.)
  try {
    const tcBox = document.getElementById('topcircles');
    const Hcomm = window.__halo.data.comm;
    if (tcBox && Hcomm) {
      const perCol = {};
      Object.keys(compTotals).forEach(k => {
        const col = Hcomm.colorOf('c:' + k);
        (perCol[col] = perCol[col] || []).push(k);
      });
      const rows = Object.keys(perCol).map(col => {
        const ks = perCol[col].sort((a, b) => compTotals[b].total - compTotals[a].total);
        return { col, t: ks.reduce((s, k) => s + compTotals[k].total, 0), n: ks.length };
      }).sort((a, b) => b.t - a.t).slice(0, 10);
      tcBox.innerHTML = '<span class="text-slate-400 text-sm">🎯 Legjellemzőbb körök: </span>' + rows.map((r, i) =>
        '<a href="#" class="halo-chip" data-act="halo-circle" data-col="' + esc(r.col) + '">' +
        '<span class="legend-swatch" style="background:' + r.col + '"></span><b>#' + (i + 1) + '</b> ' +
        fmtFt(r.t) + ' · ' + r.n + ' cég</a>'
      ).join(' ');
      window.__halo.circles = rows;
    }
  } catch (e) {}
  // Kör-kártya kattintás: belenagyítás + tagcégek listája (kattintható).
  window.__halo.focusColor = col => {
    const H = window.__halo.data;
    if (!H) return false;
    if (window.__halo.view !== 'force' && window.__halo.setView) window.__halo.setView('force');
    const ks = Object.keys(compTotals).filter(k => H.comm.colorOf('c:' + k) === col)
      .sort((a, b) => compTotals[b].total - compTotals[a].total);
    if (!ks.length) return false;
    const infoEl = document.getElementById('haloinfo');
    if (infoEl) {
      infoEl.innerHTML = '<b>' + ks.length + ' cég egy körben</b> — ' +
        fmtFt(ks.reduce((s, k) => s + compTotals[k].total, 0)) + '<br>' +
        ks.slice(0, 8).map(k =>
          '<a href="#" data-act="halo-select-company" data-nm="' + esc(compTotals[k].name) + '" class="src-link">🏢 ' +
          esc(compTotals[k].name.slice(0, 40)) + '</a>').join('<br>') +
        '<br><span class="text-slate-400">Egy kör önmagában még nem jelzés — a személyek mutatják az összefonódást.</span>';
    }
    const B = window.__halo.bubbles || [];
    const bi = B.map(b => b.color).indexOf(col);
    if (bi >= 0 && window.__halo.bubbleZoom) window.__halo.bubbleZoom(bi);
    return true;
  };
  // Teljes újrarajzolás az aktuális közép-oszlopból (cég/személy kattintásra cserélődik).
  const haloDraw = () => {
    const H = window.__halo.data, MID = window.__halo.mid;
    if (!H || !MID) return;
    const cSorted = H.cSorted, pSorted = H.pSorted, jList = MID.projects || [];
    const Hh = Math.max(420, Math.max(cSorted.length, pSorted.length, jList.length) * rowH + 70);
    const compTotals = H.compTotals, personComps = H.personComps;
    const cy = {}, py = {}, jy = {};
    cSorted.forEach((k, i) => { cy[k] = 40 + i * rowH; });
    pSorted.forEach((k, i) => { py[k] = 40 + i * rowH; });
    jList.forEach((p, j) => { jy['j' + j] = 40 + j * rowH; });
    const maxT = Math.max.apply(null, cSorted.map(k => compTotals[k].total).concat([1]));
    const cR = k => 8 + Math.sqrt(compTotals[k].total / maxT) * 18;
    document.getElementById('halocount').textContent =
      cSorted.length + ' cég, ' + pSorted.length + ' személy, ' + jList.length + ' beszerzés';
    const midTitle = 'BESZERZÉSEK — ' + String(MID.label || '') +
      (MID.hidden > 0 ? ' (+' + MID.hidden + ' további)' : '');
    let svg = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" class="w-full" id="halosvg">';
    svg += '<text x="210" y="18" font-size="12" fill="#94a3b8" text-anchor="middle">CÉGEK</text>';
    svg += '<text x="480" y="18" font-size="11" fill="#94a3b8" text-anchor="middle">' + esc(midTitle.slice(0, 46)) + '</text>';
    svg += '<text x="750" y="18" font-size="12" fill="#94a3b8" text-anchor="middle">SZEMÉLYEK</text>';
  const hitRect = (x, w, y) => '<rect x="' + x + '" y="' + (y - 13).toFixed(0) + '" width="' + w + '" height="26" fill="#ffffff" fill-opacity="0"/>';
  pSorted.forEach((pk, pi) => Object.keys(personComps[pk].comps).forEach(ck => {
    if (cy[ck] === undefined) return;
    const ci = cSorted.indexOf(ck);
    svg += '<path data-edge data-a="c' + ci + '" data-b="p' + pSorted.indexOf(pk) + '" d="M210,' + cy[ck].toFixed(0) + ' C430,' + cy[ck].toFixed(0) + ' 530,' + py[pk].toFixed(0) + ' 750,' + py[pk].toFixed(0) + '" stroke="#475569" stroke-width="1.2" fill="none" opacity="0.7"/>';
  }));
  jList.forEach((p, j) => {
    const ci = cSorted.indexOf(normWinner(p.winner));
    if (ci < 0 || cy[cSorted[ci]] === undefined) return;
    const y1 = cy[cSorted[ci]], y2 = jy['j' + j];
    svg += '<path data-edge data-a="c' + ci + '" data-b="j' + j + '" d="M210,' + y1.toFixed(0) +
      ' C320,' + y1.toFixed(0) + ' 370,' + y2.toFixed(0) + ' 480,' + y2.toFixed(0) +
      '" stroke="#8a6d1b" stroke-width="1" fill="none" opacity="0.7"/>';
  });
  cSorted.forEach((k, i) => {
    svg += '<g data-node data-idx="c' + i + '" style="cursor:pointer">' + hitRect(0, 400, cy[k]) +
      '<title>' + esc(compTotals[k].name) + ' — ' + fmtFt(compTotals[k].total) + ' · ' + compTotals[k].count + ' projekt (kattints a hálójáért)</title>' +
      '<circle cx="210" cy="' + cy[k].toFixed(0) + '" r="' + cR(k).toFixed(1) + '" fill="#38bdf8" fill-opacity="0.8" stroke="#0b1220" stroke-width="2"/>' +
      '<text x="' + (210 - cR(k) - 8).toFixed(0) + '" y="' + (cy[k] + 4).toFixed(0) + '" font-size="11" fill="#e2e8f0" text-anchor="end">' + esc(compTotals[k].name.slice(0, 28)) + '</text></g>';
  });
  jList.forEach((p, j) => {
    const y2 = jy['j' + j];
    svg += '<g data-node data-idx="j' + j + '" style="cursor:pointer">' + hitRect(400, 160, y2) +
      '<circle cx="480" cy="' + y2.toFixed(0) + '" r="4.5" fill="#fbbf24" fill-opacity="0.95" stroke="#0b1220" stroke-width="1.5">' +
      '<title>' + esc(p.title || '') + ' — ' + fmtFt(p.amount_huf || 0) + ' · ' + esc(p.winner || '') + ' · ' + esc(p.date || '') + ' (kattints a részletekért)</title></circle></g>';
  });
  pSorted.forEach((pk, i) => {
    const isBridge = Object.keys(personComps[pk].comps).length > 1;
    svg += '<g data-node data-idx="p' + i + '" style="cursor:pointer">' + hitRect(560, 340, py[pk]) +
      '<title>' + esc(personComps[pk].name) + ' — ' + Object.keys(personComps[pk].comps).length + ' cégben (kattints a hálójáért)</title>' +
      '<circle cx="750" cy="' + py[pk].toFixed(0) + '" r="' + (isBridge ? 9 : 6) + '" fill="' + (isBridge ? '#f87171' : '#a78bfa') + '" fill-opacity="0.9" stroke="#0b1220" stroke-width="2"/>' +
      '<text x="764" y="' + (py[pk] + 4).toFixed(0) + '" font-size="11" fill="#e2e8f0">' + esc(personComps[pk].name.slice(0, 30)) + '</text></g>';
  });
  svg += '</svg>';
  box.innerHTML = svg;
  };
  // Középső oszlop cseréje (cég/személy összes projektje) + hiányzó cégek pótlása.
  const FW = 900, FH = 720;
  // Csoportos nézet: közösség-színek + forma=típus (kör=cég, rombusz=személy,
  // pötty=beszerzés), méret=pénz. Fizika ha van d3-force, különben determinisztikus kör.
  // Saját determinisztikus layout-motor: taszítás + rugók + súlypont +
  // közösség-húzás. Nincs külső függőség, Node-ban is ugyanazt számolja → tesztelhető.
  const haloForceLayout = (nodes, epairs, iters) => {
    const n = nodes.length;
    if (!n) return;
    const L0 = 58, MAXD = 16;
    const dx = new Array(n), dy = new Array(n);
    for (let it = 0; it < iters; it++) {
      const ccx = {}, ccy = {}, cn = {};
      for (let i = 0; i < n; i++) {
        const c = nodes[i].color || '';
        ccx[c] = (ccx[c] || 0) + nodes[i].x; ccy[c] = (ccy[c] || 0) + nodes[i].y;
        cn[c] = (cn[c] || 0) + 1;
      }
      for (const k in cn) { ccx[k] /= cn[k]; ccy[k] /= cn[k]; }
      for (let i = 0; i < n; i++) { dx[i] = 0; dy[i] = 0; }
      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < n; j++) {
          const b = nodes[j];
          // Taszítási sugár a pontok méretéből + felirat-hely (ne feküdjenek egymáson),
          // plusz különböző közösségek tartsanak távolságot (a hidak így is összekötik őket).
          const R = (a.r + b.r) * 0.5 + 34 + (a.color !== b.color ? 36 : 0);
          let ddx = a.x - b.x, ddy = a.y - b.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 >= R * R) continue;
          let d = Math.sqrt(d2);
          if (d < 0.5) {
            ddx = ((i * 37 + j * 11) % 10) - 5; ddy = ((i * 13 + j * 29) % 10) - 5;
            d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
          }
          const f = (R - d) * 0.06 / Math.max(6, (a.r + b.r) / 2);
          const ux = ddx / d, uy = ddy / d;
          dx[i] += ux * f; dy[i] += uy * f;
          dx[j] -= ux * f; dy[j] -= uy * f;
        }
      }
      for (let k = 0; k < epairs.length; k++) {
        const ai = epairs[k][0], bi = epairs[k][1];
        const a = nodes[ai], b = nodes[bi];
        const ddx = b.x - a.x, ddy = b.y - a.y;
        const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.5;
        const f = (d - L0) * 0.02;
        const ux = ddx / d, uy = ddy / d;
        dx[ai] += ux * f; dy[ai] += uy * f;
        dx[bi] -= ux * f; dy[bi] -= uy * f;
      }
      for (let i = 0; i < n; i++) {
        const nd = nodes[i];
        if (nd.fx !== null && nd.fx !== undefined) { nd.x = nd.fx; nd.y = nd.fy; continue; }
        const c = nd.color || '';
        dx[i] += (FW / 2 - nd.x) * 0.012 + ((ccx[c] === undefined ? FW / 2 : ccx[c]) - nd.x) * 0.05;
        dy[i] += (FH / 2 - nd.y) * 0.012 + ((ccy[c] === undefined ? FH / 2 : ccy[c]) - nd.y) * 0.05;
        let mx = dx[i], my = dy[i];
        const ml = Math.sqrt(mx * mx + my * my);
        if (ml > MAXD) { mx = mx / ml * MAXD; my = my / ml * MAXD; }
        nd.x = Math.min(FW - 24, Math.max(24, nd.x + mx));
        nd.y = Math.min(FH - 18, Math.max(18, nd.y + my));
      }
    }
  };
  const haloForceTick = () => {
    const F = window.__halo.force;
    if (!F) return;
    F.nodeEls.forEach(rec => {
      const n = F.byIdx[rec.id];
      if (n && n.x !== undefined) rec.el.setAttribute('transform', 'translate(' + n.x.toFixed(1) + ',' + n.y.toFixed(1) + ')');
    });
    F.edgeEls.forEach(rec => {
      const a = F.byIdx[rec.a], b = F.byIdx[rec.b];
      if (!a || !b || a.x === undefined) return;
      rec.el.setAttribute('x1', a.x.toFixed(1)); rec.el.setAttribute('y1', a.y.toFixed(1));
      rec.el.setAttribute('x2', b.x.toFixed(1)); rec.el.setAttribute('y2', b.y.toFixed(1));
    });
  };
  // Felirat-ütközés feloldása az AKTUÁLIS pozíciókból: prioritás
  // (nagy cégek → hidak → többiek), átfedő doboz elrejtve (tooltip marad).
  // Minden elrendezés-változás után újra kell futtatni + DOM-szinkron.
  const haloLabelsResolve = () => {
    const F = window.__halo.force;
    if (!F || !F.nodes) return;
    const H = window.__halo.data || {};
    const compTotals = H.compTotals || {}, personComps = H.personComps || {};
    const labRows = F.nodes.filter(nd => nd.label).map(nd => {
      let pr = 0;
      if (nd.kind === 'c') pr = 100000 + (((compTotals[nd.key] || {}).total) || 0) / 1e9;
      else {
        const ncomp = Object.keys(((personComps[nd.key] || {}).comps) || {}).length;
        pr = (nd.bridge ? 50000 : 0) + ncomp;
      }
      const w = Math.min(200, String(nd.label).length * 6.5 + 8);
      return { nd, pr, w, h: 13, x0: nd.x - w / 2, y0: nd.y + nd.r + 4 };
    }).sort((a, b) => b.pr - a.pr);
    const labKept = [];
    labRows.forEach(L => {
      const x2 = L.x0 + L.w, y2 = L.y0 + L.h;
      const hit = labKept.some(K => L.x0 < K.x2 + 3 && x2 > K.x1 - 3 && L.y0 < K.y2 + 2 && y2 > K.y1 - 2);
      L.nd._hide = !!hit;
      if (!hit) labKept.push({ x1: L.x0, y1: L.y0, x2, y2 });
    });
  };
  const haloLabelsApply = () => {
    const F = window.__halo.force;
    if (!F) return;
    F.nodeEls.forEach(rec => {
      const n = F.byIdx[rec.id];
      if (!n || !n.label) return;
      try {
        const t = rec.el.querySelector('text[data-lbl]');
        if (t && t.style) t.style.display = n._hide ? 'none' : '';
      } catch (e) {}
    });
  };
  const haloForceDraw = () => {
    const H = window.__halo.data, MID = window.__halo.mid;
    if (!H || !MID) return;
    const cSorted = H.cSorted, pSorted = H.pSorted, jList = MID.projects || [];
    const compTotals = H.compTotals, personComps = H.personComps, comm = H.comm;
    document.getElementById('halocount').textContent =
      cSorted.length + ' cég, ' + pSorted.length + ' személy, ' + jList.length + ' beszerzés · csoportos';
    const maxT = Math.max.apply(null, cSorted.map(k => compTotals[k].total).concat([1]));
    const nodes = [], byIdx = {};
    // Felirat-szintek: hub mindig, mid csak közelről (szemantikus zoom).
    const rankC = cSorted.slice().sort((a, b) => compTotals[b].total - compTotals[a].total);
    const hubC = {}, midC = {};
    rankC.slice(0, 12).forEach(k => { hubC['c:' + k] = true; });
    rankC.slice(12, 40).forEach(k => { midC['c:' + k] = true; });
    // Ego-fókuszban minden látható cég/személy kap feliratot (ott navigálunk).
    const inEgo = !!window.__halo.ego;
    const compLabel = k => hubC['c:' + k] ? { t: compTotals[k].name, c: 'lbl-hub' }
      : ((midC['c:' + k] || inEgo) ? { t: compTotals[k].name, c: 'lbl-mid' } : null);
    cSorted.forEach((k, i) => {
      const lb = compLabel(k);
      nodes.push({ id: 'c' + i, kind: 'c', key: k, r: 8 + Math.sqrt(compTotals[k].total / maxT) * 18,
        label: lb ? lb.t : '', labelCls: lb ? lb.c : '', color: comm.colorOf('c:' + k),
        title: compTotals[k].name + ' — ' + fmtFt(compTotals[k].total) + ' · ' + compTotals[k].count + ' projekt' });
    });
    pSorted.forEach((pk, i) => {
      const ncomp = Object.keys(personComps[pk].comps).length;
      const lb = ncomp > 2 ? { t: personComps[pk].name, c: 'lbl-hub' }
        : ((ncomp === 2 || inEgo) ? { t: personComps[pk].name, c: 'lbl-mid' } : null);
      nodes.push({ id: 'p' + i, kind: 'p', key: pk, r: ncomp > 1 ? 9 : 6,
        label: lb ? lb.t : '', labelCls: lb ? lb.c : '', color: comm.colorOf('p:' + pk), bridge: ncomp > 1,
        title: personComps[pk].name + ' — ' + ncomp + ' cégben' });
    });
    jList.forEach((p, j) => {
      const ck = normWinner(p.winner);
      if (!compTotals[ck] || cSorted.indexOf(ck) < 0) return;
      nodes.push({ id: 'j' + j, kind: 'j', key: j, r: 4.5, label: '', color: comm.colorOf('c:' + ck),
        title: (p.title || '') + ' — ' + fmtFt(p.amount_huf || 0) + ' · ' + (p.winner || '') });
    });
    nodes.forEach(n => { byIdx[n.id] = n; });
    const edges = [];
    // Él-vastagság = pénz/súly: cég–projekt az összegből (log), személy–cég hídnál vastagabb.
    const projW = p => 0.8 + Math.min(3.2, Math.log10((((p || {}).amount_huf) || 0) / 1e6 + 1) * 0.9);
    pSorted.forEach((pk, pi) => Object.keys(personComps[pk].comps).forEach(ck => {
      const ci = cSorted.indexOf(ck);
      if (ci >= 0) edges.push({ a: 'c' + ci, b: 'p' + pi, proj: false,
        w: Object.keys(personComps[pk].comps).length > 1 ? 2.2 : 1.1 });
    }));
    jList.forEach((p, j) => {
      if (!byIdx['j' + j]) return;
      const ci = cSorted.indexOf(normWinner(p.winner));
      edges.push({ a: 'c' + ci, b: 'j' + j, proj: true, w: projW(p) });
    });
    // Erős kötések: 2+ közös cég két személy között → piros, vastag él (mintázat!).
    const strong = [];
    (window.__halo.strongPairs || []).forEach(sp => {
      const a = pSorted.indexOf(sp.pa), b = pSorted.indexOf(sp.pb);
      if (a >= 0 && b >= 0) {
        strong.push({ a: 'p' + a, b: 'p' + b, n: sp.n });
        edges.push({ a: 'p' + a, b: 'p' + b, proj: false, strong: sp.n, w: 2 + Math.min(3, sp.n) });
      }
    });
    window.__halo.strong = strong;
    const fullAdj = {};
    edges.forEach(e => { (fullAdj[e.a] = fullAdj[e.a] || {})[e.b] = 1; (fullAdj[e.b] = fullAdj[e.b] || {})[e.a] = 1; });
    // Ego-fókusz: csak a kiválasztott 1-2 ugrásos környezete (a 3 forgatókönyv nézete).
    // Cégek/személyek: ego + N1 + N2 (sapkázva); projektek: csak ha nyertesük is látszik.
    const EGO_CAP = 260;
    let drawNodes = nodes, drawEdges = edges, egoInfo = null;
    const ego = window.__halo.ego;
    if (ego && fullAdj[ego]) {
      const n1 = fullAdj[ego];
      const allowed = {};
      allowed[ego] = 1;
      Object.keys(n1).forEach(k => { allowed[k] = 1; });
      Object.keys(n1).forEach(k => Object.keys(fullAdj[k] || {}).forEach(k2 => {
        if (!allowed[k2] && k2[0] !== 'j') allowed[k2] = 1;
      }));
      const over = Object.keys(allowed).length - EGO_CAP;
      if (over > 0) {
        Object.keys(allowed).filter(k => k !== ego && !n1[k])
          .map(k => ({ k, d: Object.keys(fullAdj[k] || {}).length }))
          .sort((a, b) => a.d - b.d).slice(0, over)
          .forEach(x => { delete allowed[x.k]; });
      }
      drawNodes = nodes.filter(n => {
        if (n.kind === 'j') return false;
        return !!allowed[n.id];
      });
      // Projektek: csak lathato nyertessel, ertek szerint, a maradek keretbe.
      const amt = n => (((MID.projects || [])[n.key] || {}).amount_huf) || 0;
      const jPool = nodes.filter(n => {
        if (n.kind !== 'j') return false;
        const w = normWinner((((MID.projects || [])[n.key] || {}).winner) || '');
        return cSorted.indexOf(w) >= 0 && !!allowed['c' + cSorted.indexOf(w)];
      }).sort((a, b) => amt(b) - amt(a));
      const budget = Math.max(20, EGO_CAP - drawNodes.length);
      drawNodes = drawNodes.concat(jPool.slice(0, budget));
      const have = {};
      drawNodes.forEach(n => { have[n.id] = 1; });
      drawEdges = edges.filter(e => have[e.a] && have[e.b]);
      egoInfo = { n1: Object.keys(n1).length, dropped: Math.max(0, over) };
    }
    const adj = {};
    drawEdges.forEach(e => { (adj[e.a] = adj[e.a] || {})[e.b] = 1; (adj[e.b] = adj[e.b] || {})[e.a] = 1; });
    window.__halo.adj = adj;
    // Kiinduló pozíciók közösségenként, majd a layout-motor rendezi széjjel.
    const groups = {};
    nodes.forEach(n => { (groups[n.color] = groups[n.color] || []).push(n); });
    const gkeys = Object.keys(groups);
    gkeys.forEach((gk, gi) => {
      const arr = groups[gk], base = (gi / Math.max(1, gkeys.length)) * Math.PI * 2;
      arr.forEach((n, k) => {
        const rr = 70 + (k % 7) * 26 + Math.floor(k / 7) * 8;
        const aa = base + ((k * 2.39996) % (Math.PI * 2 / Math.max(1, gkeys.length))) * 0.9;
        n.x = FW / 2 + rr * Math.cos(aa) * 1.35;
        n.y = FH / 2 + rr * Math.sin(aa) * 0.85;
        n.fx = null; n.fy = null;
      });
    });
    drawNodes.forEach((n, ni) => { n.ni = ni; });
    const epairs = [];
    drawEdges.forEach(e => {
      const a = byIdx[e.a], b = byIdx[e.b];
      if (a && b) epairs.push([a.ni, b.ni]);
    });
    haloForceLayout(drawNodes, epairs, 140);
    haloLabelsResolve();
    // Buborék-réteg: közösségenként egy kör (távolról ez látszik).
    const bubAgg = {};
    drawNodes.forEach(n => {
      if (n.kind === 'j') return;
      const e = bubAgg[n.color] = bubAgg[n.color] || { color: n.color, c: 0, p: 0, t: 0, x: 0, y: 0 };
      if (n.kind === 'c') { e.c++; e.t += (compTotals[n.key] && compTotals[n.key].total) || 0; }
      else e.p++;
      e.x += n.x; e.y += n.y;
    });
    const maxBubT = Math.max.apply(null, Object.keys(bubAgg).map(k => bubAgg[k].t).concat([1]));
    const bubbles = Object.keys(bubAgg).map(col => {
      const e = bubAgg[col], tot = Math.max(1, e.c + e.p);
      return { color: col, c: e.c, p: e.p, t: e.t, x: e.x / tot, y: e.y / tot,
        r: 22 + Math.sqrt(e.t / maxBubT) * 54 };
    }).sort((a, b) => b.t - a.t);
    bubbles.forEach((b, i) => { b.rank = i; });
    window.__halo.bubbles = bubbles;
    // Hidak a buborékok között (közös személyek száma).
    const pairW = {};
    pSorted.forEach(pk => {
      const cols = [];
      Object.keys(personComps[pk].comps).forEach(ck => {
        const col = comm.colorOf('c:' + ck);
        if (cols.indexOf(col) < 0) cols.push(col);
      });
      for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) {
        const key = cols[a] < cols[b] ? cols[a] + '|' + cols[b] : cols[b] + '|' + cols[a];
        pairW[key] = (pairW[key] || 0) + 1;
      }
    });
    const bubByCol = {};
    bubbles.forEach(b => { bubByCol[b.color] = b; });
    // Buborékok szétterítése: rangsor szerint ellipszisre, majd motoros finomhangolás
    // az erős kötések rugóival (hogy ne csússzanak egymásra, mint eddig).
    bubbles.forEach((b, i) => {
      const aa = (i / Math.max(1, bubbles.length)) * Math.PI * 2 - Math.PI / 2;
      b.x = FW / 2 + 300 * Math.cos(aa); b.y = FH / 2 + 210 * Math.sin(aa);
      b.fx = null; b.fy = null; b.ni = i;
    });
    const bubPairs = [];
    Object.keys(pairW).forEach(key => {
      if (pairW[key] < 2) return;
      const A = bubByCol[key.split('|')[0]], B = bubByCol[key.split('|')[1]];
      if (A && B) bubPairs.push([A.ni, B.ni]);
    });
    haloForceLayout(bubbles, bubPairs, 60);
    let aggSvg = '<g class="lyr-agg">';
    Object.keys(pairW).forEach(key => {
      const A = bubByCol[key.split('|')[0]], B = bubByCol[key.split('|')[1]];
      if (!A || !B) return;
      aggSvg += '<line x1="' + A.x.toFixed(1) + '" y1="' + A.y.toFixed(1) +
        '" x2="' + B.x.toFixed(1) + '" y2="' + B.y.toFixed(1) +
        '" stroke="#94a3b8" stroke-width="' + Math.min(5, 1 + pairW[key]) + '" opacity="0.35"/>';
    });
    bubbles.forEach((b, bi) => {
      aggSvg += '<g class="bubs" data-bubble="' + bi + '" transform="translate(' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ')">' +
        '<circle cx="0" cy="0" r="' + b.r.toFixed(1) + '" fill="' + b.color + '" fill-opacity="0.28" stroke="' + b.color + '" stroke-width="2.5"/>' +
        '<text data-fs="13" y="-3" font-size="13" font-weight="bold" fill="#e2e8f0" text-anchor="middle">#' + (bi + 1) + '</text>' +
        '<text data-fs="11" y="12" font-size="11" fill="#e2e8f0" text-anchor="middle">' + Math.round(b.t / 1e9) + ' Mrd · ' + b.c + ' cég</text></g>';
    });
    aggSvg += '</g>';
    // Nézeti transzformáció: alapból kicsit ránagyítva (ego-fókusznál még közelebb).
    // A felhasználó görgőzése/húzása felülírja (auto:false → megmarad újrarajzoláskor is).
    const defK = egoInfo ? 1.35 : 1.15;
    let vt = window.__halo.vt;
    if (!vt || vt.auto) vt = { x: FW / 2 * (1 - defK), y: FH / 2 * (1 - defK), k: defK, auto: true };
    window.__halo.vt = vt;
    let svg = '<svg viewBox="0 0 ' + FW + ' ' + FH + '" class="w-full" id="halosvg-force">' +
      '<g id="halo-vp" data-k="' + haloVpLevelOf(vt.k) + '" transform="translate(' + vt.x.toFixed(1) + ',' + vt.y.toFixed(1) + ') scale(' + vt.k + ')">' +
      aggSvg + '<g class="lyr-detail">';
    drawEdges.forEach(e => {
      const ecol = e.strong ? '#f87171' : (e.proj ? '#8a6d1b' : '#475569');
      svg += '<line data-edge data-a="' + e.a + '" data-b="' + e.b + '" x1="0" y1="0" x2="0" y2="0" stroke="' +
        ecol + '" stroke-width="' + (e.w || 1.1) + '" vector-effect="non-scaling-stroke" opacity="0.7"/>';
    });
    drawNodes.forEach(n => {
      let shape = '';
      if (n.kind === 'p') {
        // Személy = NÉGYZET (best practice: azonnal lászik, mi micsoda).
        const s = n.r * 1.5;
        shape = '<rect class="nshape" x="' + (-s) + '" y="' + (-s) + '" width="' + (s * 2) + '" height="' + (s * 2) +
          '" fill="' + n.color + '" fill-opacity="0.9" stroke="' +
          (n.bridge ? '#f87171' : '#0b1220') + '" stroke-width="' + (n.bridge ? 2.5 : 2) + '" vector-effect="non-scaling-stroke"/>';
      } else {
        shape = '<circle class="nshape" cx="0" cy="0" r="' + n.r.toFixed(1) + '" fill="' + n.color + '" fill-opacity="0.9" stroke="#0b1220" stroke-width="2" vector-effect="non-scaling-stroke"/>';
      }
      svg += '<g data-node data-idx="' + n.id + '" transform="translate(' + n.x.toFixed(1) + ',' + n.y.toFixed(1) + ')">' +
        shape +
        '<circle class="nhit" cx="0" cy="0" r="' + (n.r + 9).toFixed(1) + '" fill="#ffffff" fill-opacity="0"/>' +
        (n.label ? '<text data-lbl="1" class="' + (n.labelCls || 'lbl-hub') + '" data-fs="11" y="' + (n.r + 14).toFixed(0) + '" font-size="11" fill="#e2e8f0" text-anchor="middle"' + (n._hide ? ' style="display:none"' : '') + '>' + esc(n.label.slice(0, 24)) + '</text>' : '') +
        '</g>';
    });
  svg += '</g></g></svg>';
    box.innerHTML = svg;
    const nodeEls = [], edgeEls = [];
    box.querySelectorAll('[data-node]').forEach(el => {
      let shape = null, hit = null, text = null;
      try {
        shape = el.querySelector('.nshape');
        hit = el.querySelector('.nhit');
        text = el.querySelector('text[data-fs]');
      } catch (e) {}
      nodeEls.push({ id: el.dataset.idx, el, shape, hit, text });
    });
    box.querySelectorAll('[data-edge]').forEach(el => edgeEls.push({ a: el.dataset.a, b: el.dataset.b, el }));
    window.__halo.force = { nodes: drawNodes, edges: drawEdges, byIdx, epairs, nodeEls, edgeEls };
    // Közösség-jelmagyarázat pénz szerint rangsorolva (melyik kör nyert sokat).
    const dc = drawNodes.filter(n => n.kind === 'c').length,
      dp = drawNodes.filter(n => n.kind === 'p').length,
      dj = drawNodes.filter(n => n.kind === 'j').length;
    document.getElementById('halocount').textContent =
      dc + ' cég, ' + dp + ' személy, ' + dj + ' beszerzés · csoportos' + (egoInfo ? ' · 🎯 fókusz' : '');
    const cc = {};
    drawNodes.forEach(n => {
      if (n.kind === 'j') return;
      const e = cc[n.color] = cc[n.color] || { c: 0, p: 0, t: 0 };
      if (n.kind === 'c') { e.c++; e.t += (compTotals[n.key] && compTotals[n.key].total) || 0; }
      else e.p++;
    });
    const cBox = document.getElementById('communities');
    let egoChip = '';
    if (egoInfo) {
      const egoN = nodes.filter(n => n.id === ego)[0];
      const egoName = egoN ? String(egoN.title || '').split(' — ')[0] : '';
      egoChip = '🎯 <b>' + esc(egoName.slice(0, 40)) + '</b> köre (' + drawNodes.length +
        ' pont) <a href="#" data-act="halo-unfocus" class="src-link">✕ teljes háló</a> &nbsp; ';
    }
    if (cBox) cBox.innerHTML = egoChip + '<span class="text-slate-400">Körök pénze: </span>' +
      Object.keys(cc).sort((a, b) => cc[b].t - cc[a].t).slice(0, 8).map((col, i) =>
        '<span class="legend-swatch" style="background:' + col + '"></span><b>' + (i + 1) + '.</b> ' +
        fmtFt(cc[col].t) + ' · ' + cc[col].c + ' cég'
      ).join(' &nbsp; ');
    // Ego-rögzítés, ha van kijelölés.
    if (window.__halo.pinSel) window.__halo.pinSel();
    haloForceTick();
    haloVpApply();
  };
  const haloDrawView = () => {
    if (window.__halo.view === 'force') { haloForceDraw(); } else {
      window.__halo.force = null;
      const cBox = document.getElementById('communities');
      if (cBox) cBox.innerHTML = '';
      haloDraw();
    }
    if (window.__halo.applySignals) window.__halo.applySignals();
  };
  // Nézeti nagyítás/mozgatás (görgő-zoom a kurzor körül, háttér-húzás = pan).
  const haloVpApply = () => {
    const vt = window.__halo.vt;
    if (!vt) return;
    try {
      const vp = box.querySelector('#halo-vp');
      if (vp) {
        vp.setAttribute('transform',
          'translate(' + vt.x.toFixed(1) + ',' + vt.y.toFixed(1) + ') scale(' + vt.k + ')');
        vp.setAttribute('data-k', haloVpLevelOf(vt.k));
        // Konstans képernyő-méretű feliratok: a zoommal fordítottan skálázva,
        // hogy közelről se nőjenek tapéta-betűkké.
        vp.querySelectorAll('text[data-fs]').forEach(t => {
          t.setAttribute('font-size', (Number(t.dataset.fs) / vt.k).toFixed(1));
        });
      }
    } catch (e) {}
    // Alakzatok képernyő-mérete is állandó: közelítve a TÁVOLSÁGOK nőnek,
    // a pontok nem — így be lehet menni közéjük (ne csak nagyítson mindent).
    if (vt._sk !== vt.k) {
      vt._sk = vt.k;
      const F = window.__halo.force;
      if (F && F.nodeEls) F.nodeEls.forEach(rec => {
        const n = F.byIdx[rec.id];
        if (!n) return;
        try {
          const rr = Math.max(1.5, n.r / vt.k);
          if (rec.shape) {
            if (n.kind === 'p') {
              const s = rr * 1.5;
              rec.shape.setAttribute('x', (-s).toFixed(1));
              rec.shape.setAttribute('y', (-s).toFixed(1));
              rec.shape.setAttribute('width', (s * 2).toFixed(1));
              rec.shape.setAttribute('height', (s * 2).toFixed(1));
            } else {
              rec.shape.setAttribute('r', rr.toFixed(1));
            }
          }
          if (rec.hit) rec.hit.setAttribute('r', ((n.r + 9) / vt.k).toFixed(1));
          if (rec.text) rec.text.setAttribute('y', ((n.r + 14) / vt.k).toFixed(0));
        } catch (e) {}
      });
    }
  };
  const haloVpZoom = (f, cx, cy) => {
    const vt = window.__halo.vt;
    if (!vt) return;
    const k2 = Math.min(5, Math.max(0.4, vt.k * f));
    if (k2 === vt.k) return;
    let sx = FW / 2, sy = FH / 2;
    try {
      const svg = box.querySelector('#halosvg-force');
      const pt = new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse());
      sx = pt.x; sy = pt.y;
    } catch (e) {}
    const lx = (sx - vt.x) / vt.k, ly = (sy - vt.y) / vt.k;
    vt.x = sx - lx * k2; vt.y = sy - ly * k2; vt.k = k2; vt.auto = false;
    haloVpApply();
  };
  window.__halo.vpZoom = haloVpZoom;
  // Simított nézetmozgás ugrás nélkül (rAF; nélküle azonnali — pl. tesztben).
  const haloVpAnimateTo = (to, ms) => {
    const vt = window.__halo.vt;
    if (!vt || !to) return;
    ms = ms || 450;
    if (typeof requestAnimationFrame === 'undefined') {
      vt.x = to.x; vt.y = to.y; vt.k = to.k; vt.auto = false;
      haloVpApply();
      return;
    }
    const from = { x: vt.x, y: vt.y, k: vt.k };
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const cur = window.__halo.vt;
      if (!cur) return;
      cur.x = from.x + (to.x - from.x) * e;
      cur.y = from.y + (to.y - from.y) * e;
      cur.k = from.k + (to.k - from.k) * e;
      cur.auto = false;
      haloVpApply();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  window.__halo.vpAnimateTo = haloVpAnimateTo;
  window.__halo.bubbleZoom = bi => {
    const B = window.__halo.bubbles || [];
    const b = B[bi];
    if (!b) return false;
    if (!window.__halo.vt) return false;
    const k2 = 2.4;
    haloVpAnimateTo({ x: FW / 2 - b.x * k2, y: FH / 2 - b.y * k2, k: k2 }, 450);
    return true;
  };
  window.__halo.zoomReset = () => {
    const old = window.__halo.vt ? { x: window.__halo.vt.x, y: window.__halo.vt.y, k: window.__halo.vt.k } : null;
    window.__halo.vt = null;
    if (window.__halo.view === 'force') haloForceDraw();
    if (window.__halo.applyIso) window.__halo.applyIso();
    if (old && window.__halo.vt) {
      const to = { x: window.__halo.vt.x, y: window.__halo.vt.y, k: window.__halo.vt.k };
      window.__halo.vt.x = old.x; window.__halo.vt.y = old.y; window.__halo.vt.k = old.k;
      haloVpAnimateTo(to, 450);
    }
  };
  // Ego-rögzítés: a kiválasztott pont középre áll (csak csoportos nézetben).
  window.__halo.pinSel = () => {
    const F = window.__halo.force, sel = window.__halo.sel;
    if (!F) return;
    F.nodes.forEach(n => { n.fx = null; n.fy = null; });
    if (sel && F.byIdx[sel]) {
      const t = F.byIdx[sel];
      t.fx = FW / 2; t.fy = FH / 2; t.x = FW / 2; t.y = FH / 2;
    }
    haloForceLayout(F.nodes, F.epairs, 60);
    haloLabelsResolve();
    haloLabelsApply();
    haloForceTick();
  };
  // Ego-fókusz: csak a kiválasztott környezete látszik (forgatókönyv-nézet).
  // Ha távolról jövünk (k < 1.2), közelít is 1.35-re; ha már közel vagyunk, meghagyja.
  window.__halo.focusEgo = idx => {
    window.__halo.ego = idx || null;
    if (idx && window.__halo.vt && window.__halo.vt.k < 1.2) window.__halo.vt.auto = true;
    haloForceDraw();
    if (window.__halo.applyIso) window.__halo.applyIso();
    if (window.__halo.applySignals) window.__halo.applySignals();
  };
  const haloFocusSel = () => {
    if (window.__halo.view === 'force' && window.__halo.sel && window.__halo.focusEgo) {
      window.__halo.focusEgo(window.__halo.sel);
    }
  };
  const haloSetMid = (mid, requiredKeys) => {
    const H = window.__halo.data;
    if (!H) return;
    (requiredKeys || []).forEach(k => {
      if (H.cSorted.length < 250 && H.compTotals[k] && H.cSorted.indexOf(k) < 0) H.cSorted.push(k);
    });
    const all = (mid && mid.projects) || [];
    const shown = all.slice(0, MID_CAP);
    window.__halo.mid = { projects: shown, label: (mid && mid.label) || '',
      total: (mid && mid.total) || all.length, hidden: all.length - shown.length };
    haloDrawView();
    if (window.__halo.applyIso) window.__halo.applyIso();
  };
  haloDrawView();
  const haloDescribe = idx => {
    const H = window.__halo.data;
    const kind = idx[0], i = Number(idx.slice(1));
    if (kind === 'c') {
      const k = H.cSorted[i];
      const persons = H.pSorted.filter(pk => H.personComps[pk].comps[k]).map(pk => H.personComps[pk].name);
      const relCount = {};
      H.pSorted.forEach(pk => {
        if (!H.personComps[pk].comps[k]) return;
        Object.keys(H.personComps[pk].comps).forEach(ck2 => {
          if (ck2 !== k && H.compTotals[ck2]) relCount[ck2] = (relCount[ck2] || 0) + 1;
        });
      });
      const rel = Object.keys(relCount).sort((a, b) => relCount[b] - relCount[a]).slice(0, 8);
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('halo', 'ceg:' + H.compTotals[k].name);
        window.history.replaceState(null, '', u.toString());
      } catch (e) {}
      info.innerHTML = '<b>' + esc(H.compTotals[k].name) + '</b> — ' + fmtFt(H.compTotals[k].total) +
        '<br>Személyek: ' + (persons.map(nm =>
          '<a href="#" data-act="halo-select-person" data-nm="' + esc(nm) + '" class="src-link">👤 ' + esc(nm) + '</a>'
        ).join(', ') || '–') +
        (rel.length ? '<br>🔗 Kapcsolódó cégek (közös személyeken át): ' + rel.map(ck2 =>
          '<a href="#" data-act="halo-select" data-ck="' + esc(ck2) + '" class="src-link">' +
          esc(H.compTotals[ck2].name.slice(0, 30)) + ' (' + relCount[ck2] + ' fő)</a>').join(' · ') : '') +
        '<br><span class="text-slate-400">Betöltés…</span>';
      fetchCompanyProjects(H.compTotals[k].name).then(r => {
        if (window.__halo.sel !== idx) return;
        const projs = (r.projects || []).slice().sort((a, b) => b.amount_huf - a.amount_huf);
        // Középső oszlop: a cég ÖSSZES projektje (nem csak a TOP 200).
        haloSetMid({ projects: projs, label: H.compTotals[k].name + ' — ' + (r.total || projs.length) + ' projekt',
          total: r.total || projs.length }, [k]);
        // Források: a cég személyeinek kutatási linkjei (ha vannak).
        const srcs = [];
        persons.forEach(nm => {
          const pp = (DB.people || []).filter(x => (x.name || '') === nm);
          for (let si = 0; si < pp.length; si++) {
            if (pp[si].source && srcs.indexOf(pp[si].source) < 0) srcs.push(pp[si].source);
          }
        });
        const personKeys = H.pSorted.filter(pk => H.personComps[pk].comps[k]);
        info.innerHTML = '<b>' + esc(H.compTotals[k].name) + '</b> — ' + fmtFt(H.compTotals[k].total) +
          ' · ' + (r.total || projs.length) + ' projekt<br>Személyek: ' + (persons.map(nm =>
            '<a href="#" data-act="halo-select-person" data-nm="' + esc(nm) + '" class="src-link">👤 ' + esc(nm) + '</a>'
          ).join(', ') || '–') +
          (srcs.length ? '<br>📰 Források: ' + srcs.slice(0, 5).map((s, si) =>
            '<a class="src-link" href="' + esc(s) + '" target="_blank" rel="noopener">[' + (si + 1) + ']</a>').join(' ') : '') +
          '<br><button data-act="map-company" data-cn="' + esc(H.compTotals[k].name) + '" style="margin-top:6px;padding:6px 12px;border-radius:8px;background:#38bdf8;color:#0b1220;font-weight:bold">🗺️ Mutat a térképen</button> ' +
          '<button data-act="list-company" data-cn="' + esc(H.compTotals[k].name) + '" style="margin-top:6px;padding:6px 12px;border-radius:8px;background:#1e293b;font-weight:bold">📋 Projektek listában</button> ' +
          '<button data-act="halo-share" style="margin-top:6px;padding:6px 12px;border-radius:8px;background:#1e293b;font-weight:bold">🔗 Megosztás</button>' +
          haloTimelineHtml(projs) +
          haloMatrixHtml([k].concat(rel), personKeys, H.compTotals, H.personComps) +
          '<div style="max-height:180px;overflow:auto;margin-top:6px">' +
          projs.slice(0, 10).map(p => '<div style="margin-bottom:4px">• <b>' + esc(p.title.slice(0, 70)) + '</b><br>&nbsp;&nbsp;' + fmtFt(p.amount_huf) + ' · ' + esc(p.date) + '</div>').join('') +
          (projs.length > 10 ? '<div class="text-slate-400">…és még ' + (projs.length - 10) + '</div>' : '') + '</div>' +
          HALO_DISCLAIMER;
      });
    } else if (kind === 'p') {
      const pk = H.pSorted[i];
      const csAll = Object.keys(H.personComps[pk].comps);
      const csIn = csAll.filter(ck => H.compTotals[ck]);
      const csOut = csAll.filter(ck => !H.compTotals[ck]);
      // Sok cég esetén csak a top-12-t töltjük be részletesen (fetch),
      // a többi darabszáma az aggregátumból jön (gyors + pontos).
      const csTop = csIn.map(ck => ({ ck, t: (H.compTotals[ck] && H.compTotals[ck].total) || 0 }))
        .sort((a, b) => b.t - a.t).slice(0, 12).map(x => x.ck);
      const csRest = csIn.filter(ck => csTop.indexOf(ck) < 0);
      let html = '<b>' + esc(H.personComps[pk].name) + '</b> — ' + csAll.length + ' cégben';
      let personProjCount = 0, personTotal = 0;
      csIn.forEach(ck => {
        personProjCount += (H.compTotals[ck] && H.compTotals[ck].count) || 0;
        personTotal += (H.compTotals[ck] && H.compTotals[ck].total) || 0;
      });
      const personMid = [];
      const jobs = csTop.map(ck => fetchCompanyProjects(H.compTotals[ck].name).then(r => ({ ck, r })));
      Promise.all(jobs).then(done => {
        if (window.__halo.sel !== idx) return;
        done.forEach(({ ck, r }) => {
          const projs = r.projects || [];
          projs.forEach(p => { personMid.push(p); });
          html += '<div style="margin-top:6px"><b>🏢 <a href="#" data-act="halo-select-company" data-nm="' + esc(H.compTotals[ck].name) + '" class="src-link">' + esc(H.compTotals[ck].name) + '</a></b> <span class="text-slate-400">(' + (r.total || projs.length) + ' projekt)</span></div>' +
            '<div style="max-height:130px;overflow:auto">' +
            projs.slice().sort((a, b) => b.amount_huf - a.amount_huf).slice(0, 6).map(p =>
              '<div style="margin-bottom:3px">• <b>' + esc(p.title.slice(0, 60)) + '</b> — ' + fmtFt(p.amount_huf) + ' · ' + esc(p.date) + '</div>').join('') + '</div>';
        });
        if (csRest.length) {
          let restCount = 0;
          csRest.forEach(ck => { restCount += (H.compTotals[ck] && H.compTotals[ck].count) || 0; });
          html += '<div class="text-slate-400" style="margin-top:6px">További ' + csRest.length +
            ' cég részletezés nélkül (' + restCount + ' projekt): ' +
            csRest.slice(0, 12).map(ck => esc(H.compTotals[ck].name.slice(0, 40))).join(' · ') +
            (csRest.length > 12 ? ' …' : '') + '</div>';
        }
        if (csOut.length) {
          html += '<div class="text-slate-400" style="margin-top:6px">További cégek: ' +
            csOut.map(ck => esc(ck)).join(' · ') + '</div>';
        }
        if (personProjCount >= 15) {
          html = '📊 <b>Mintázat: sok projekt egy kézben — ' + personProjCount + ' projekt, ' + fmtFt(personTotal) + '.</b><br>' + html;
        }
        // Személy saját forrása (ha van).
        const meSrc = ((DB.people || []).filter(x => (x.name || '') === H.personComps[pk].name && x.source) || [])
          .map(x => x.source).filter((s, si, arr) => arr.indexOf(s) === si);
        if (meSrc.length) {
          html += '<br>📰 Forrás: ' + meSrc.slice(0, 3).map((s, si) =>
            '<a class="src-link" href="' + esc(s) + '" target="_blank" rel="noopener">[' + (si + 1) + ']</a>').join(' ');
        }
        html += ' <button data-act="halo-share" style="margin-top:6px;padding:6px 12px;border-radius:8px;background:#1e293b;font-weight:bold">🔗 Megosztás</button>';
        html += haloTimelineHtml(personMid);
        // Mátrix: a személy cégei × a bennük szereplő személyek.
        const coP = H.pSorted.filter(qk => qk !== pk && csIn.some(ck => H.personComps[qk].comps[ck])).slice(0, 12);
        html += haloMatrixHtml(csIn.slice(0, 10), [pk].concat(coP), H.compTotals, H.personComps);
        html += HALO_DISCLAIMER;
        info.innerHTML = html;
        // Középső oszlop: a személy ÖSSZES cégének összes projektje.
        personMid.sort((a, b) => b.amount_huf - a.amount_huf);
        haloSetMid({ projects: personMid,
          label: H.personComps[pk].name + ' — ' + personProjCount + ' projekt ' + csAll.length + ' cégben',
          total: personProjCount }, csIn);
      });
      info.innerHTML = '<b>' + esc(H.personComps[pk].name) + '</b> — projektek betöltése…';
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('halo', 'szemely:' + H.personComps[pk].name);
        window.history.replaceState(null, '', u.toString());
      } catch (e) {}
    } else if (kind === 'j') {
      const p = ((window.__halo.mid && window.__halo.mid.projects) || [])[i] || {};
      const haloKnown = !!(p && H.compTotals[normWinner(p.winner)]);
      info.innerHTML = '<b>🧾 ' + esc(p.title.slice(0, 90)) + '</b><br>' +
        '<b>' + fmtFt(p.amount_huf) + '</b> · ' + esc(p.date) + '<br>' +
        'Nyertes: ' + esc(p.winner) +
        (p.programme ? '<br>Program: ' + esc(p.programme) : '') + srcLink(p) +
        '<br><button data-act="list-company" data-cn="' + esc(p.winner) + '" style="margin-top:6px;padding:6px 12px;border-radius:8px;background:#1e293b;font-weight:bold">📋 Cég összes projektje</button> ' +
        (haloKnown ? '<button data-act="halo-select-company" data-nm="' + esc(p.winner) + '" style="margin-top:6px;padding:6px 12px;border-radius:8px;background:#38bdf8;color:#0b1220;font-weight:bold">🕸️ Nyertes hálója</button> ' : '') +
        (hasGeo(p) ? '<button data-act="map-project" data-ji="' + i + '" style="margin-top:6px;padding:6px 12px;border-radius:8px;background:#38bdf8;color:#0b1220;font-weight:bold">🗺️ Mutat a térképen</button>' : '');
    }
  };
  const haloApplyIso = () => {
    const sel = window.__halo.sel;
    const adj = {};
    box.querySelectorAll('[data-edge]').forEach(pth => {
      const a = pth.dataset.a, b = pth.dataset.b;
      if (!a || !b) return;
      (adj[a] = adj[a] || {})[b] = true;
      (adj[b] = adj[b] || {})[a] = true;
    });
    box.querySelectorAll('[data-node]').forEach(g => {
      if (!sel) { g.setAttribute('opacity', '1'); return; }
      const id = g.dataset.idx;
      const keep = id === sel || (adj[sel] && adj[sel][id]);
      g.setAttribute('opacity', keep ? '1' : '0.15');
    });
    box.querySelectorAll('[data-edge]').forEach(pth => {
      if (!sel) { pth.setAttribute('opacity', '0.7'); return; }
      const hit = pth.dataset.a === sel || pth.dataset.b === sel;
      pth.setAttribute('opacity', hit ? '1' : '0.08');
    });
  };
  window.__halo.describe = haloDescribe;
  window.__halo.applyIso = haloApplyIso;
  // Jelzés-kapcsolók: csak a mintázatba illő pontok maradnak erősen (kijelölés nélkül).
  window.__halo.applySignals = () => {
    const H = window.__halo.data, MID = window.__halo.mid;
    if (!H) return;
    const s1 = document.getElementById('sig-strong'),
      s2 = document.getElementById('sig-top'),
      s3 = document.getElementById('sig-bridge');
    const anyOn = (s1 && s1.checked) || (s2 && s2.checked) || (s3 && s3.checked);
    if (!anyOn || window.__halo.sel) {
      if (window.__halo.applyIso) window.__halo.applyIso();
      return;
    }
    const keep = {};
    const keepCompany = ck => {
      const ci = H.cSorted.indexOf(ck);
      if (ci >= 0) keep['c' + ci] = 1;
    };
    if (s1 && s1.checked) (window.__halo.strongPairs || []).forEach(sp => {
      [sp.pa, sp.pb].forEach(pk => {
        const pi = H.pSorted.indexOf(pk);
        if (pi >= 0) keep['p' + pi] = 1;
        Object.keys(H.personComps[pk].comps).forEach(keepCompany);
      });
    });
    if (s3 && s3.checked) H.pSorted.forEach((pk, pi) => {
      if (Object.keys(H.personComps[pk].comps).length > 1) {
        keep['p' + pi] = 1;
        Object.keys(H.personComps[pk].comps).forEach(keepCompany);
      }
    });
    if (s2 && s2.checked) {
      const money = {};
      H.cSorted.forEach(k => {
        const col = H.comm.colorOf('c:' + k);
        money[col] = (money[col] || 0) + ((H.compTotals[k] || {}).total || 0);
      });
      const top3 = Object.keys(money).sort((a, b) => money[b] - money[a]).slice(0, 3);
      H.cSorted.forEach(k => {
        if (top3.indexOf(H.comm.colorOf('c:' + k)) >= 0) keepCompany(k);
      });
      H.pSorted.forEach((pk, pi) => {
        if (Object.keys(H.personComps[pk].comps).some(ck => {
          const ci = H.cSorted.indexOf(ck);
          return ci >= 0 && keep['c' + ci];
        })) keep['p' + pi] = 1;
      });
    }
    ((MID && MID.projects) || []).forEach((p, j) => {
      const ci = H.cSorted.indexOf(normWinner((p || {}).winner));
      if (ci >= 0 && keep['c' + ci]) keep['j' + j] = 1;
    });
    window.__halo.sigKeep = keep;
    try {
      box.querySelectorAll('[data-node]').forEach(el => el.setAttribute('opacity', keep[el.dataset.idx] ? '1' : '0.07'));
      box.querySelectorAll('[data-edge]').forEach(el => {
        el.setAttribute('opacity', (keep[el.dataset.a] && keep[el.dataset.b]) ? '0.9' : '0.04');
      });
    } catch (e) {}
  };
  window.__halo.resetMid = () => haloSetMid(defaultMid(), []);
  // Nézetváltás: rendezett oszlopok <-> csoportos szabad háló.
  window.__halo.setView = v => {
    window.__halo.view = (v === 'force') ? 'force' : 'cols';
    document.querySelectorAll('[data-hview]').forEach(b => {
      if (b.dataset.hview === window.__halo.view) b.classList.add('halo-view-active');
      else b.classList.remove('halo-view-active');
    });
    const d1 = document.getElementById('halodesc'), d2 = document.getElementById('halodesc-force');
    if (d1 && d1.style) d1.style.display = window.__halo.view === 'force' ? 'none' : '';
    if (d2 && d2.style) d2.style.display = window.__halo.view === 'force' ? '' : 'none';
    haloTipHide();
    haloDrawView();
    if (window.__halo.applyIso) window.__halo.applyIso();
  };
  // Név alapján kiválasztás (chipek + keresztlinkek a 3 forgatókönyvhöz).
  // A szekció TETEJÉRE görget (block:start), hogy a nézetkapcsoló látható maradjon.
  const haloScroll = () => {
    try { document.getElementById('sec-halo').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  };
  window.__halo.selectCompany = name => {
    const H = window.__halo.data;
    if (!H) return false;
    const nk = normWinner(name);
    if (!H.compTotals[nk]) return false;
    let ci = H.cSorted.indexOf(nk);
    if (ci < 0) {
      if (H.cSorted.length >= 250) return false;
      H.cSorted.push(nk); ci = H.cSorted.length - 1;
      haloDrawView();
    }
    window.__halo.sel = 'c' + ci;
    haloDescribe(window.__halo.sel);
    window.__halo.applyIso();
    if (window.__halo.pinSel) window.__halo.pinSel();
    haloFocusSel();
    haloScroll();
    return true;
  };
  window.__halo.selectPerson = name => {
    const H = window.__halo.data;
    if (!H) return false;
    const nl = String(name || '').trim().toLowerCase();
    const pi = H.pSorted.indexOf(nl);
    if (pi < 0) return false;
    window.__halo.sel = 'p' + pi;
    haloDescribe(window.__halo.sel);
    window.__halo.applyIso();
    if (window.__halo.pinSel) window.__halo.pinSel();
    haloFocusSel();
    haloScroll();
    return true;
  };
  if (!box.__haloBound) {
    box.__haloBound = true;
    box.addEventListener('click', ev => {
      const g = ev.target && ev.target.closest ? ev.target.closest('[data-node]') : null;
      if (!g) return;
      const idx = g.dataset.idx;
      window.__halo.sel = (window.__halo.sel === idx) ? null : idx;
      haloTipHide();
      if (window.__halo.view === 'force') {
        // Csoportos nézetben kattintás = ego-fókusz (csak a környék látszik).
        if (window.__halo.sel) { haloDescribe(window.__halo.sel); window.__halo.focusEgo(window.__halo.sel); }
        else {
          window.__halo.ego = null;
          haloSetMid(defaultMid(), []);
          info.textContent = 'Kattints egy cégre, projektre vagy személyre.';
        }
      } else {
        if (window.__halo.sel) haloDescribe(window.__halo.sel);
        else {
          // Kijelölés vége: közép-oszlop vissza a TOP 200-ra.
          haloSetMid(defaultMid(), []);
          info.textContent = 'Kattints egy cégre, projektre vagy személyre.';
        }
      }
      haloApplyIso();
      if (window.__halo.pinSel) window.__halo.pinSel();
    });
  }
  // Hover-kiemelés + húzogatás (csak csoportos nézetben).
  // Hover-kiemelés + AZONNALI tooltip (csak csoportos nézetben).
  // (A natív SVG <title> késleltetett, ezért saját div követi az egeret.)
  const haloTipShow = (ev, id) => {
    const F = window.__halo.force;
    const tip = document.getElementById('halotip');
    const n = F && F.byIdx[id];
    if (!tip || !n) return;
    const parts = String(n.title || '').split(' — ');
    tip.innerHTML = '<b>' + esc(parts[0]) + '</b>' +
      (parts[1] ? '<br><span class="text-slate-400">' + esc(parts.slice(1).join(' — ')) + '</span>' : '') +
      '<br><span class="text-sky-300">kattints a részletekért</span>';
    tip.style.display = 'block';
    try {
      const w = window.innerWidth || 1200;
      tip.style.left = Math.min(ev.clientX + 14, w - 335) + 'px';
      tip.style.top = (ev.clientY + 16) + 'px';
    } catch (e) {}
  };
  const haloTipHide = () => {
    const tip = document.getElementById('halotip');
    if (tip) tip.style.display = 'none';
  };
  if (!box.__haloHoverBound) {
    box.__haloHoverBound = true;
    box.addEventListener('mouseover', ev => {
      if (window.__halo.view !== 'force' || window.__halo.sel) return;
      const bb = ev.target && ev.target.closest ? ev.target.closest('[data-bubble]') : null;
      if (bb) {
        const B = window.__halo.bubbles || [];
        const b = B[Number(bb.dataset.bubble)];
        const tip = document.getElementById('halotip');
        if (b && tip) {
          tip.innerHTML = '<b>' + (b.rank + 1) + '. kör — ' + esc(fmtFt(b.t)) + '</b>' +
            '<br><span class="text-slate-400">' + b.c + ' cég · ' + b.p + ' személy</span>' +
            '<br><span class="text-sky-300">kattints a belenagyításhoz</span>';
          tip.style.display = 'block';
          try {
            const w = window.innerWidth || 1200;
            tip.style.left = Math.min(ev.clientX + 14, w - 335) + 'px';
            tip.style.top = (ev.clientY + 16) + 'px';
          } catch (e) {}
        }
        return;
      }
      const g = ev.target && ev.target.closest ? ev.target.closest('[data-node]') : null;
      if (!g) return;
      const id = g.dataset.idx, adj = window.__halo.adj || {};
      const keep = {}; keep[id] = 1;
      Object.keys(adj[id] || {}).forEach(k => { keep[k] = 1; });
      box.querySelectorAll('[data-node]').forEach(el => el.setAttribute('opacity', keep[el.dataset.idx] ? '1' : '0.12'));
      box.querySelectorAll('[data-edge]').forEach(el => {
        el.setAttribute('opacity', (el.dataset.a === id || el.dataset.b === id) ? '1' : '0.05');
      });
      haloTipShow(ev, id);
    });
    box.addEventListener('mouseout', ev => {
      if (window.__halo.view !== 'force' || window.__halo.sel) return;
      const to = ev.relatedTarget && ev.relatedTarget.closest ? ev.relatedTarget.closest('[data-node]') : null;
      const from = ev.target && ev.target.closest ? ev.target.closest('[data-node]') : null;
      if (to && from && to.dataset.idx === from.dataset.idx) return;
      haloTipHide();
      box.querySelectorAll('[data-node]').forEach(el => el.setAttribute('opacity', '1'));
      box.querySelectorAll('[data-edge]').forEach(el => el.setAttribute('opacity', '0.7'));
    });
  }
  if (!box.__haloDragBound) {
    box.__haloDragBound = true;
    let dragN = null, panS = null, lastP = null, movedPx = 0;
    // Képernyő-koordináta → a #halo-vp NÉZETEN BELÜLI koordinátája (zoom/pan-helyes).
    const svgPoint = ev => {
      try {
        const svg = box.querySelector('#halosvg-force');
        if (!svg || !svg.getScreenCTM) return null;
        const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(svg.getScreenCTM().inverse());
        const vt = window.__halo.vt;
        if (vt && vt.k) return { x: (pt.x - vt.x) / vt.k, y: (pt.y - vt.y) / vt.k };
        return pt;
      } catch (e) { return null; }
    };
    box.addEventListener('mousedown', ev => {
      if (window.__halo.view !== 'force' || !window.__halo.force) return;
      movedPx = 0;
      lastP = { x: ev.clientX, y: ev.clientY };
      const g = ev.target && ev.target.closest ? ev.target.closest('[data-node]') : null;
      if (g) {
        dragN = window.__halo.force.byIdx[g.dataset.idx] || null;
        if (dragN) { dragN.fx = dragN.x; dragN.fy = dragN.y; }
        panS = null;
      } else {
        dragN = null;
        panS = { x: ev.clientX, y: ev.clientY };
      }
    });
    box.addEventListener('mousemove', ev => {
      if (window.__halo.view !== 'force') return;
      if (lastP) movedPx += Math.abs(ev.clientX - lastP.x) + Math.abs(ev.clientY - lastP.y);
      lastP = { x: ev.clientX, y: ev.clientY };
      if (dragN && window.__halo.force) {
        const pt = svgPoint(ev);
        if (pt) {
          dragN.fx = pt.x; dragN.fy = pt.y; dragN.x = pt.x; dragN.y = pt.y;
          haloForceTick();
        }
        return;
      }
      if (panS) {
        try {
          const svg = box.querySelector('#halosvg-force');
          const sc = (svg && svg.getScreenCTM && svg.getScreenCTM().a) || 1;
          const vt = window.__halo.vt;
          if (vt && sc) {
            vt.x += (ev.clientX - panS.x) / sc; vt.y += (ev.clientY - panS.y) / sc;
            vt.auto = false; haloVpApply();
          }
        } catch (e) {}
        panS = { x: ev.clientX, y: ev.clientY };
      }
    });
    const endDrag = () => {
      if (dragN) {
        if (!window.__halo.sel || window.__halo.sel !== dragN.id) { dragN.fx = null; dragN.fy = null; }
        const F = window.__halo.force;
        if (F) { haloForceLayout(F.nodes, F.epairs, 25); haloLabelsResolve(); haloLabelsApply(); haloForceTick(); }
        dragN = null;
      }
      panS = null;
    };
    box.addEventListener('mouseup', endDrag);
    box.addEventListener('mouseleave', endDrag);
    // Húzás végén a kattintás ne jelöljön ki (különben minden drag select lenne).
    box.addEventListener('click', ev => {
      if (movedPx > 6) { try { ev.stopPropagation(); ev.preventDefault(); } catch (e) {} movedPx = 0; }
    }, true);
  }
  if (!box.__haloWheelBound) {
    box.__haloWheelBound = true;
    // Buborék-kattintás: belenagyítás a körbe (szemantikus zoom).
    box.addEventListener('click', ev => {
      const bb = ev.target && ev.target.closest ? ev.target.closest('[data-bubble]') : null;
      if (!bb || window.__halo.view !== 'force' || !window.__halo.bubbleZoom) return;
      window.__halo.bubbleZoom(Number(bb.dataset.bubble));
    });
    // Görgő-zoom a kurzor körül (csak a gráf fölött fogja meg az oldalt).
    box.addEventListener('wheel', ev => {
      if (window.__halo.view !== 'force' || !window.__halo.vt) return;
      try { ev.preventDefault(); } catch (e) {}
      haloVpZoom(ev.deltaY < 0 ? 1.18 : 1 / 1.18, ev.clientX, ev.clientY);
    }, { passive: false });
    // Dupla kattintás: alapnézet vissza.
    box.addEventListener('dblclick', ev => {
      if (window.__halo.view !== 'force') return;
      try { ev.preventDefault(); } catch (e) {}
      if (window.__halo.zoomReset) window.__halo.zoomReset();
    });
  }
  const bridgeEls = bBox.querySelectorAll('[data-bridge]');
  if (bBox && bridgeEls) bridgeEls.forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault();
    const H = window.__halo.data;
    const pi = H.pSorted.indexOf(a.dataset.bridge);
    if (pi < 0) return;
    window.__halo.sel = 'p' + pi;
    haloDescribe(window.__halo.sel);
    haloApplyIso();
    haloFocusSel();
  }));
}

let sankeyCache = null;
async function renderSankey() {
  const box = document.getElementById('sankey');
  if (!box) return;
  if (!sankeyCache) {
    try {
      sankeyCache = await fetch('/api/sankey').then(r => r.json());
    } catch (e) { box.innerHTML = '<div class="text-sm text-slate-400">Nem tölthető be.</div>'; return; }
  }
  const flows1 = (sankeyCache && sankeyCache.flows1) || [];
  const flows2 = (sankeyCache && sankeyCache.flows2) || [];
  if (!flows1.length) { box.innerHTML = '<div class="text-sm text-slate-400">Nincs adat.</div>'; return; }
  const W = 900, X0 = 8, X1 = 330, X2 = 640, XW = 140;
  const coColor = {};
  flows2.forEach(f => { coColor[f[0]] = f[1]; });
  const progTot = {}, coTot = {}, colTot = {};
  flows1.forEach(f => {
    progTot[f[0]] = (progTot[f[0]] || 0) + f[2];
    coTot[f[1]] = (coTot[f[1]] || 0) + f[2];
  });
  Object.keys(coTot).forEach(c => {
    const col = coColor[c] || COMM_GRAY;
    colTot[col] = (colTot[col] || 0) + coTot[c];
  });
  const progs = Object.keys(progTot).sort((a, b) => progTot[b] - progTot[a]);
  const cos = Object.keys(coTot).sort((a, b) => coTot[b] - coTot[a]);
  const cols = Object.keys(colTot).sort((a, b) => colTot[b] - colTot[a]);
  // Oszloponkénti skála + DINAMIKUS magasság: a leghosszabb oszlop szabja meg,
  // így semmi sem lóg le a viewBox-ról (az oldal görgethető).
  const lay = (keys, tot) => {
    const sum = keys.reduce((s, k) => s + tot[k], 0) || 1;
    let y = 34; const pos = {};
    keys.forEach(k => {
      const h = Math.max(14, (tot[k] / sum) * 500);
      pos[k] = { y, h };
      y += h + 7;
    });
    return { pos, end: y };
  };
  const pL = lay(progs, progTot), cL = lay(cos, coTot), gL = lay(cols, colTot);
  const pP = pL.pos, cP = cL.pos, gP = gL.pos;
  const H = Math.ceil(Math.max(pL.end, cL.end, gL.end)) + 16;
  const band = (x1, y1, x2, y2, w, color) =>
    '<path d="M' + x1 + ',' + y1.toFixed(1) + ' C' + ((x1 + x2) / 2).toFixed(1) + ',' + y1.toFixed(1) +
    ' ' + ((x1 + x2) / 2).toFixed(1) + ',' + y2.toFixed(1) + ' ' + x2 + ',' + y2.toFixed(1) +
    '" stroke="' + color + '" stroke-width="' + Math.max(1, w).toFixed(1) + '" fill="none" opacity="0.45"/>';
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="w-full" style="min-width:640px">' +
    '<text x="' + (X0 + 4) + '" y="14" font-size="12" fill="#94a3b8">PROGRAM</text>' +
    '<text x="' + (X1 + 4) + '" y="14" font-size="12" fill="#94a3b8">CÉG (kattintható)</text>' +
    '<text x="' + (X2 + 4) + '" y="14" font-size="12" fill="#94a3b8">TULAJDONOSI KÖR (kattintható)</text>';
  const node = (x, y, h, fill, label, sub, extra) =>
    '<rect x="' + x + '" y="' + y.toFixed(1) + '" width="' + XW + '" height="' + h.toFixed(1) +
    '" rx="4" fill="' + fill + '" fill-opacity="0.85"' + (extra || '') + '/>' +
    '<text x="' + (x + 6) + '" y="' + (y + 15).toFixed(1) + '" font-size="10" fill="#e2e8f0">' +
    esc(String(label).slice(0, 24)) + '<title>' + esc(String(label)) + '</title></text>' +
    '<text x="' + (x + 6) + '" y="' + (y + 28).toFixed(1) + '" font-size="10" fill="#94a3b8">' + esc(sub) + '</text>';
  const pUsed = {}, cUsed = {}, gUsed = {};
  // Sávok a FORRÁS csomóponthoz arányosítva (minden csomópont kitölti a saját sávjait).
  flows1.forEach(f => {
    const w = Math.max(1.5, (f[2] / (progTot[f[0]] || 1)) * (pP[f[0]].h - 4) * 0.92);
    const y1 = pP[f[0]].y + (pUsed[f[0]] || 0) + w / 2;
    const y2 = cP[f[1]].y + (cUsed[f[1]] || 0) + w / 2;
    pUsed[f[0]] = (pUsed[f[0]] || 0) + w;
    cUsed[f[1]] = (cUsed[f[1]] || 0) + w;
    svg += band(X0 + XW, y1, X1, y2, w, coColor[f[1]] || '#38bdf8');
  });
  cos.forEach(c => {
    const col = coColor[c] || COMM_GRAY;
    const y1 = cP[c].y + cP[c].h / 2;
    const w2 = Math.max(1.5, (cP[c].h - 4) * 0.9);
    const y2 = gP[col].y + (gUsed[col] || 0) + w2 / 2;
    gUsed[col] = (gUsed[col] || 0) + w2;
    svg += band(X1 + XW, y1, X2, y2, Math.min(w2, 22), col);
  });
  progs.forEach(p => {
    svg += node(X0, pP[p].y, pP[p].h, '#1e293b', p, fmtFt(progTot[p]));
  });
  cos.forEach(c => {
    svg += '<g data-cojump="' + esc(c) + '" style="cursor:pointer">' +
      node(X1, cP[c].y, cP[c].h, coColor[c] || '#38bdf8', c, fmtFt(coTot[c])) + '</g>';
  });
  cols.forEach((col, i) => {
    const members = cos.filter(x => (coColor[x] || COMM_GRAY) === col)
      .sort((a, b) => coTot[b] - coTot[a]);
    const nm = members.length > 1
      ? members[0].slice(0, 20) + ' +' + (members.length - 1)
      : (members[0] || '').slice(0, 24);
    svg += '<g data-act="halo-sankey-circle" data-col="' + esc(col) + '" style="cursor:pointer">' +
      node(X2, gP[col].y, gP[col].h, col, '#' + (i + 1) + ' ' + nm, fmtFt(colTot[col]) + ' · ' + members.length + ' cég') + '</g>';
  });
  svg += '</svg>';
  svg += '<div id="sankeyinfo" class="text-sm mt-2 text-sky-300">Kattints egy körre a tagcégekért és kulcsszemélyekért.</div>';
  box.innerHTML = svg;
}
// Sankey-kör kattintás: tagcégek + kulcsszemélyek (mind kattintható).
function sankeyCircleInfo(col) {
  const flows1 = (sankeyCache && sankeyCache.flows1) || [];
  const flows2 = (sankeyCache && sankeyCache.flows2) || [];
  const coColor = {};
  flows2.forEach(f => { coColor[f[0]] = f[1]; });
  const coTot = {};
  flows1.forEach(f => { coTot[f[1]] = (coTot[f[1]] || 0) + f[2]; });
  const members = Object.keys(coColor).filter(c => coColor[c] === col)
    .sort((a, b) => (coTot[b] || 0) - (coTot[a] || 0));
  if (!members.length) return '';
  const tot = members.reduce((s, c) => s + (coTot[c] || 0), 0);
  const normCo = {};
  members.forEach(c => { normCo[normWinner(c)] = c; });
  const per = {};
  (DB.people || []).forEach(pp => {
    if (normCo[normWinner(pp.company || '')] === undefined) return;
    const e = per[pp.name] = per[pp.name] || { n: 0, src: '' };
    e.n++;
    if (pp.source) e.src = pp.source;
  });
  const plist = Object.keys(per).sort((a, b) => per[b].n - per[a].n).slice(0, 8);
  const html = '<b>' + members.length + ' cég egy körben</b> — ' + fmtFt(tot) + '<br>' +
    members.slice(0, 8).map(c =>
      '<a href="#" data-cojump="' + esc(c) + '" class="src-link">🏢 ' + esc(c.slice(0, 42)) + '</a>').join('<br>') +
    (plist.length
      ? '<br><b>👥 Kulcsszemélyek:</b><br>' + plist.map(nm =>
        '<a href="#" data-act="halo-select-person" data-nm="' + esc(nm) + '" class="src-link">👤 ' + esc(nm) + '</a> (' + per[nm].n + ' cég)' +
        (per[nm].src ? ' <a class="src-link" href="' + esc(per[nm].src) + '" target="_blank" rel="noopener">forrás ↗</a>' : '')
      ).join('<br>')
      : '<br><span class="text-slate-400">Ehhez a körhöz nincs feltöltött személy.</span>') +
    HALO_DISCLAIMER;
  const info = document.getElementById('sankeyinfo');
  if (info) info.innerHTML = html;
  return html;
}
window.__sankeyCircle = sankeyCircleInfo;

function renderCharts() {
  const mm = monthlyView();
  const mKeys = Object.keys(mm).sort();
  const BW = 900, BH = 170;
    document.getElementById('chart-monthly').innerHTML = (function () {
    const ks = mKeys;
    if (!ks.length) return '<div class="text-sm text-slate-400">Nincs adat.</div>';
    const mx = Math.max.apply(null, ks.map(k => mm[k]).concat([1]));
    let b = '';
    const st = Math.max(1, Math.ceil(ks.length / 12));
    ks.forEach((m, i) => {
      const h = Math.max(2, (mm[m] / mx) * (BH - 34));
      const x = (i / Math.max(1, ks.length)) * BW;
      const w = Math.max(1, BW / Math.max(1, ks.length) - 1);
      b += '<rect x="' + x.toFixed(1) + '" y="' + (BH - 10 - h).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="#38bdf8"><title>' + m + ': ' + fmtFt(mm[m]) + '</title></rect>';
      if (i % st === 0) b += '<text x="' + x.toFixed(1) + '" y="' + (BH - 12) + '" font-size="8" fill="#94a3b8" transform="rotate(-30 ' + x.toFixed(1) + ' ' + (BH - 12) + ')" text-anchor="end">' + m + '</text>';
    });
    return '<svg viewBox="0 0 ' + BW + ' ' + BH + '" class="w-full"><line x1="0" y1="' + (BH - 20) + '" x2="' + BW + '" y2="' + (BH - 20) + '" stroke="#334155"/>' + b + '</svg>';
  })();
  const topN = Number((document.getElementById('topn') || {}).value || 10);
  const topTowns = srcTowns()
    .map(t => ({ name: t.name, total: SRC.mode === 'eu' ? t.eu : SRC.mode === 'ted' ? t.ted : t.total }))
    .sort((a, b) => b.total - a.total).slice(0, Math.max(1, Math.min(200, topN)));
  const tMax = Math.max.apply(null, topTowns.map(x => x.total).concat([1]));
  document.getElementById('chart-towns').innerHTML = topTowns.map(x =>
    '<div class="flex items-center gap-2 text-sm mb-1"><div class="w-36 truncate">' + esc(x.name) + '</div>' +
    '<div class="flex-1 bg-slate-900 rounded"><div class="rounded" style="width:' + Math.max(2, (x.total / tMax) * 100).toFixed(1) + '%;background:#fbbf24">&nbsp;</div></div>' +
    '<div class="w-24 text-right text-slate-400">' + fmtFt(x.total) + '</div></div>'
  ).join('');
}

async function init() {
  const [stats, townsR, monthlyR, winnersR, peopleR, topR, tmR, boundsRes,
    tedTownsR, tedWinnersR, tedMonthlyR, tedTopR, tedTmR] = await Promise.all([
    fetch('/api/stats').then(r => r.json()),
    fetch('/api/agg/towns').then(r => r.json()),
    fetch('/api/monthly').then(r => r.json()),
    fetch('/api/winners').then(r => r.json()),
    fetch('/api/people').then(r => r.json()).catch(() => ({ people: [] })),
    fetch('/api/top').then(r => r.json()).catch(() => ({ projects: [] })),
    fetch('/api/townmonths').then(r => r.json()).catch(() => ({ townmonths: {} })),
    fetch('/api/bounds').then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/tedagg?k=agg_ted_towns').then(r => r.json()).catch(() => ({ towns: [] })),
    fetch('/api/tedagg?k=agg_ted_winners').then(r => r.json()).catch(() => ({ winners: [] })),
    fetch('/api/tedagg?k=agg_ted_monthly').then(r => r.json()).catch(() => ({ monthly: {} })),
    fetch('/api/tedagg?k=agg_ted_top').then(r => r.json()).catch(() => ({ projects: [] })),
    fetch('/api/tedagg?k=agg_ted_townmonths').then(r => r.json()).catch(() => ({ townmonths: {} }))
  ]);
  DB.stats = stats;
  DB.towns = townsR.towns || [];
  DB.monthly = monthlyR.monthly || {};
  DB.winners = winnersR.winners || [];
  DB.people = (peopleR && peopleR.people) || [];
  DB.top = (topR && topR.projects) || [];
  DB.townmonths = (tmR && tmR.townmonths) || {};
  DB.bounds = boundsRes && boundsRes.features ? boundsRes : null;
  DB.tedTowns = tedTownsR.towns || [];
  DB.tedWinners = tedWinnersR.winners || [];
  DB.tedMonthly = tedMonthlyR.monthly || {};
  DB.tedTop = tedTopR.projects || [];
  DB.tedTownmonths = tedTmR.townmonths || {};
  DB.months = Object.keys(Object.assign({}, DB.monthly, DB.tedMonthly)).sort();
  DB.counties = [...new Set((stats.counties || []).concat(DB.tedTowns.map(t => t.county).filter(Boolean)))].sort();
  renderDatasrc();
  try { console.log('[kosszpenz] build ' + BUILD); } catch (e) {}
  const slider = document.getElementById('timeline');
  slider.min = 0; slider.max = Math.max(0, DB.months.length - 1); slider.value = slider.max;
  document.getElementById('datemin').textContent = DB.months[0] || '–';
  document.getElementById('datemax').textContent = DB.months[DB.months.length - 1] || '–';
  window.__months = DB.months;
  window.__SRC = SRC;
  const countySel = document.getElementById('county');
  DB.counties.forEach(c => countySel.add(new Option('Megye: ' + c, c)));
  const personSel = document.getElementById('personsel');
  [...new Set(DB.people.map(pp => pp.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hu'))
    .forEach(n => personSel.add(new Option(n, n)));
  refreshDatalist();
  document.getElementById('peoplecount').textContent = DB.people.length;
  ['timeline', 'sort', 'county', 'personsel', 'topn', 'minamt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', render);
  });
  // Nagyításra a térkép megye ↔ település nézetet vált.
  if (!map.__zoomBound) {
    map.__zoomBound = true;
    map.on('zoomend', () => { try { render(); } catch (e) {} });
  }
  document.getElementById('q').addEventListener('change', () => {
    resolveSearch(document.getElementById('q').value.trim());
  });
  document.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-m]').forEach(x => x.classList.remove('pill-active'));
    b.classList.add('pill-active'); metricMode = b.dataset.m; render();
  }));
  document.querySelectorAll('[data-s]').forEach(b => {
    if (b.dataset.s === SRC.mode) {
      document.querySelectorAll('[data-s]').forEach(x => x.classList.remove('pill-active'));
      b.classList.add('pill-active');
    }
    b.addEventListener('click', () => {
      document.querySelectorAll('[data-s]').forEach(x => x.classList.remove('pill-active'));
      b.classList.add('pill-active');
      SRC.mode = b.dataset.s;
      try { localStorage.setItem('kosszpenz-src', SRC.mode === 'all' ? '' : SRC.mode); } catch (e) {}
      renderDatasrc();
      render();
    });
  });
  document.querySelectorAll('[data-hview]').forEach(b => b.addEventListener('click', () => {
    if (window.__halo.setView) window.__halo.setView(b.dataset.hview);
  }));
  document.querySelectorAll('[data-xtab]').forEach(b => b.addEventListener('click', () => {
    XT.tab = b.dataset.xtab; renderXplorer();
  }));
  const xq = document.getElementById('xq');
  if (xq) xq.addEventListener('input', () => { XT.q = xq.value; renderXList(); });
  ['sig-strong', 'sig-top', 'sig-bridge'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.addEventListener) el.addEventListener('change', () => {
      if (window.__halo.applySignals) window.__halo.applySignals();
    });
  });
  document.querySelectorAll('[data-csort]').forEach(th => th.addEventListener('click', () => {
    const k = th.dataset.csort;
    cSort = (cSort.key === k) ? { key: k, dir: -cSort.dir } : { key: k, dir: k === 'name' ? 1 : -1 };
    renderWinners();
  }));
  if (!document.__cojumpBound) {
    document.__cojumpBound = true;
    const jumpFilter = (name, detId) => {
      document.getElementById('q').value = '';
      const ps = document.getElementById('personsel');
      if (ps) ps.value = '';
      if (detId) {
        const d = document.getElementById(detId);
        if (d) d.open = true;
      }
    };
    document.addEventListener('click', ev => {
      const t = ev.target && ev.target.closest ? ev.target.closest('[data-cojump],[data-act]') : null;
      if (!t) return;
      ev.preventDefault();
      if (t.hasAttribute('data-cojump')) {
        setDrillCompany(t.dataset.cojump, 'det-cegek', 'sec-cegek');
      } else if (t.dataset.act === 'map-company') {
        setDrillCompany(t.dataset.cn, null, 'sec-terkep');
      } else if (t.dataset.act === 'list-company') {
        setDrillCompany(t.dataset.cn, 'det-lista', 'sec-lista');
      } else if (t.dataset.act === 'list-town') {
        setDrillTown(t.dataset.cn, 'det-lista', 'sec-lista');
      } else if (t.dataset.act === 'map-project') {
        const mid = (window.__halo && window.__halo.mid) || {};
        const p = (mid.projects || [])[Number(t.dataset.ji)];
        if (p && hasGeo(p)) {
          DRILL = { kind: 'top' };
          render();
          document.getElementById('sec-terkep').scrollIntoView({ behavior: 'smooth' });
          try { map.flyTo([Number(p.lat), Number(p.lng)], 11, { duration: 1.2 }); } catch (e) {}
        }
      } else if (t.dataset.act === 'halo-select') {
        const H = window.__halo.data;
        const ci = (H.cSorted || []).indexOf(t.dataset.ck);
        if (ci >= 0 && H.describe && H.applyIso) {
          H.sel = 'c' + ci;
          H.describe(H.sel);
          H.applyIso();
          if (H.view === 'force' && H.focusEgo) H.focusEgo(H.sel);
          document.getElementById('sec-halo').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else if (t.dataset.act === 'halo-unfocus') {
        window.__halo.ego = null;
        if (window.__halo.setView) window.__halo.setView('force');
      } else if (t.dataset.act === 'halo-circle') {
        if (window.__halo.focusColor) window.__halo.focusColor(t.dataset.col);
      } else if (t.dataset.act === 'halo-sankey-circle') {
        if (window.__sankeyCircle) window.__sankeyCircle(t.dataset.col);
      } else if (t.dataset.act === 'halo-share') {
        try {
          const done = () => {
            try { t.textContent = '✓ Kimásolva'; } catch (e) {}
            setTimeout(() => { try { t.textContent = '🔗 Megosztás'; } catch (e) {} }, 2000);
          };
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(String(window.location.href)).then(done, done);
          } else if (typeof window.prompt === 'function') {
            window.prompt('Másold ki a linket:', String(window.location.href));
          }
        } catch (e) {}
      } else if (t.dataset.act === 'halo-select-company') {
        if (window.__halo.selectCompany) window.__halo.selectCompany(t.dataset.nm);
      } else if (t.dataset.act === 'halo-select-person') {
        if (window.__halo.selectPerson) window.__halo.selectPerson(t.dataset.nm);
      } else if (t.dataset.act === 'halo-chip') {
        const H = window.__halo;
        if (!H || !H.data) return;
        const kind = t.dataset.kind;
        if (kind === 'project') {
          if (H.resetMid) H.resetMid();
          H.ego = null;
          H.sel = 'j0';
          H.describe('j0');
          H.applyIso();
          document.getElementById('sec-halo').scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (kind === 'company' && H.selectCompany) {
          H.selectCompany(t.dataset.nm);
        } else if (kind === 'person' && H.selectPerson) {
          H.selectPerson(t.dataset.nm);
        }
      }
    });
  }
  render();
  // Megosztható URL (?halo=ceg:Név / személy:Név): közvetlen mélylink a hálóba.
  try {
    const loc = (typeof location !== 'undefined') ? location : null;
    const m = loc && loc.search && loc.search.match(/[?&]halo=(ceg|szemely):([^&]+)/);
    if (m && window.__halo) {
      const nm = decodeURIComponent(m[2]);
      const okk = m[1] === 'ceg' ? window.__halo.selectCompany(nm) : window.__halo.selectPerson(nm);
      if (okk) {
        const s = document.getElementById('sec-halo');
        if (s && s.scrollIntoView) s.scrollIntoView();
      }
    }
  } catch (e) {}
}
init();
</script>
</body>
</html>`;
}

async function handleKozpenz(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/data' && request.method === 'GET') {
      // Visszamenőleges kompatibilitás: top lista meta-csomagolásban.
      // (A teljes állomány darabolva van; lásd /api/stats és README.)
      const kv = env && env.KOSSZPENZ_KV ? env.KOSSZPENZ_KV : null;
      if (!kv) return jsonResponse({ success: false, error: 'KV binding hiányzik.' }, 500);
      try {
        const top = await kv.get('kosszpenz_agg_top', 'json').catch(() => null);
        const raw = Array.isArray(top) ? top : ((top && top.projects) || []);
        const projects = raw.length ? raw.map(expandTopProject) : FALLBACK_PROJECTS;
        return jsonResponse({ count: projects.length, source: raw.length ? 'kv-top200' : 'fallback', projects });
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, { status: 500 });
      }
    }
    if (path === '/api/stats' && request.method === 'GET') {
      const kv = env && env.KOSSZPENZ_KV ? env.KOSSZPENZ_KV : null;
      if (!kv) return jsonResponse({ success: false, error: 'KV binding hiányzik.' }, 500);
      try {
        const [metaR, townsR, monthlyR] = await Promise.all([
          kv.get('kosszpenz_agg_meta', 'json'),
          kv.get('kosszpenz_agg_towns', 'json'),
          kv.get('kosszpenz_agg_monthly', 'json')
        ]);
        const towns = townsR || [];
        const monthly = monthlyR || {};
        const months = Object.keys(monthly).sort();
        const counties = [...new Set(towns.map(t => t.county).filter(Boolean))].sort();
        const out = {
          total_rows: (metaR && metaR.total_rows) || 0,
          with_geo: (metaR && metaR.with_geo) || 0,
          total_huf: towns.reduce((s, t) => s + (t.total || 0), 0),
          date_min: (metaR && metaR.date_min) || null,
          date_max: (metaR && metaR.date_max) || null,
          months, counties,
          towns: towns.map(t => t.name),
          updated_at: (metaR && metaR.updated_at) || null
        };
        try {
          const tm = await kv.get('kosszpenz_ted_meta', 'json').catch(() => null);
          if (tm) {
            out.ted_rows = tm.total_rows || 0;
            out.ted_huf = tm.total_huf || 0;
            out.ted_updated = tm.updated_at || null;
          }
        } catch (e) {}
        return jsonResponse(out);
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, { status: 500 });
      }
    }
    if (path === '/api/agg/towns' && request.method === 'GET') {
      const v = env && env.KOSSZPENZ_KV ? await env.KOSSZPENZ_KV.get('kosszpenz_agg_towns', 'json').catch(() => null) : null;
      return jsonResponse({ towns: v || [] });
    }
    if (path === '/api/winners' && request.method === 'GET') {
      const v = env && env.KOSSZPENZ_KV ? await env.KOSSZPENZ_KV.get('kosszpenz_agg_winners', 'json').catch(() => null) : null;
      return jsonResponse({ winners: v || [] });
    }
    if (path === '/api/monthly' && request.method === 'GET') {
      const v = env && env.KOSSZPENZ_KV ? await env.KOSSZPENZ_KV.get('kosszpenz_agg_monthly', 'json').catch(() => null) : null;
      return jsonResponse({ monthly: v || {} });
    }
    if (path === '/api/sankey' && request.method === 'GET') {
      // Program -> cég -> tulajdonosi kör (top metszet, előre számolva).
      const v = env && env.KOSSZPENZ_KV ? await env.KOSSZPENZ_KV.get('kosszpenz_agg_sankey', 'json').catch(() => null) : null;
      return jsonResponse(v || { programs: [], flows1: [], flows2: [] });
    }
    if (path === '/api/vizsgalat/graph' && request.method === 'GET') {
      // Forenszikus gráf: cégek + személyek + élek, validációs jelentéssel, edge-cache-elve.
      if (!env || !env.KOSSZPENZ_KV) {
        return jsonResponse({ success: false, error: 'KV binding hiányzik.' }, 500);
      }
      try {
        const topN = Math.min(500, Math.max(10, Number(url.searchParams.get('top')) || 100));
        const cacheKey = new Request(url.toString(), { method: 'GET' });
        let res = null;
        try { res = await caches.default.match(cacheKey); } catch (e) {}
        if (!res) {
          const g = await buildVizsgalatGraph(env, topN);
          res = jsonResponse({ success: true, nodes: g.nodes, edges: g.edges, meta: g.meta, projects: g.projects || [] });
          res.headers.set('Cache-Control', 'public, max-age=600');
          try { ctx.waitUntil(caches.default.put(cacheKey, res.clone())); } catch (e) {}
        }
        return res;
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, 500);
      }
    }
    if (path === '/vizsgalat' || path === '/vizsgalat/') {
      return new Response(renderVizsgalatHtml(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }
      });
    }
    if (path === '/api/tedagg' && request.method === 'GET') {
      // Hazai TED-aggregátumok olvasása szigorú allowlisttel.
      const ALLOW = {
        agg_ted_towns: 'towns', agg_ted_winners: 'winners', agg_ted_monthly: 'monthly',
        agg_ted_top: 'projects', agg_ted_townmonths: 'townmonths', ted_meta: 'meta'
      };
      const k = String(url.searchParams.get('k') || '');
      if (!ALLOW[k] || !env || !env.KOSSZPENZ_KV) {
        return jsonResponse({ success: false, error: 'tiltott kulcs' }, 400);
      }
      try {
        const v = await env.KOSSZPENZ_KV.get('kosszpenz_' + k, 'json').catch(() => null);
        const o = {};
        o[ALLOW[k]] = (v === null || v === undefined) ? (k === 'ted_meta' ? null : (k === 'agg_ted_monthly' || k === 'agg_ted_townmonths' ? {} : [])) : v;
        return jsonResponse(o);
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, { status: 500 });
      }
    }
    if (path === '/api/top' && request.method === 'GET') {
      const v = env && env.KOSSZPENZ_KV ? await env.KOSSZPENZ_KV.get('kosszpenz_agg_top', 'json').catch(() => null) : null;
      const raw = Array.isArray(v) ? v : ((v && v.projects) || []);
      return jsonResponse({ projects: raw.map(expandTopProject) });
    }
    if (path === '/api/townmonths' && request.method === 'GET') {
      const v = env && env.KOSSZPENZ_KV ? await env.KOSSZPENZ_KV.get('kosszpenz_agg_townmonths', 'json').catch(() => null) : null;
      return jsonResponse({ townmonths: v || {} });
    }
    if (path === '/api/settlement' && request.method === 'GET') {
      // Egy település ÖSSZES projektje: EU (kosszpenz_tel_) + hazai TED
      // (kosszpenz_ted_tel_ + éves darabok, pl. Budapest). Forrás: p.source.
      const name = url.searchParams.get('name') || '';
      if (!name || !env || !env.KOSSZPENZ_KV) {
        return jsonResponse({ success: false, error: 'Hiányzó név vagy KV.' }, 400);
      }
      try {
        const raw = await env.KOSSZPENZ_KV.get('kosszpenz_tel_' + name, 'json');
        const projects = (raw && raw.projects) || [];
        let ted = [];
        try {
          const keys = ['kosszpenz_ted_tel_' + name];
          for (let y = 2014; y <= 2026; y++) keys.push('kosszpenz_ted_tel_' + name + '_' + y);
          const parts = await Promise.all(keys.map(k =>
            env.KOSSZPENZ_KV.get(k, 'json').catch(() => null)));
          parts.forEach(r => {
            const arr = Array.isArray(r) ? r : ((r && r.projects) || []);
            arr.forEach(p => ted.push(p));
          });
        } catch (e) {}
        ted = ted.map(p => Object.assign({ source: 'ted', type: 'hazai' }, p));
        const all = projects.concat(ted).sort((a, b) => b.amount_huf - a.amount_huf);
        return jsonResponse({ name, count: all.length, eu: projects.length, ted: ted.length,
          projects: all.slice(0, 2000) });
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, { status: 500 });
      }
    }
    if (path === '/api/company' && request.method === 'GET') {
      // Egy cég ÖSSZES projektje: EU (index -> településkulcsok) + hazai TED (shard).
      const name = url.searchParams.get('name') || '';
      if (!name || !env || !env.KOSSZPENZ_KV) {
        return jsonResponse({ success: false, error: 'Hiányzó név vagy KV.' }, 400);
      }
      try {
        const idx = await env.KOSSZPENZ_KV.get('kosszpenz_agg_index', 'json').catch(() => null);
        const nk = normCompanyKey(name);
        const townCounts = (idx && idx[nk]) || {};
        // Pontos darabszám az indexből; a településeket darabszám szerint,
        // csökkenőben, legfeljebb 20-as kötegekben olvassuk, amíg az összes
        // indexelt sor meg nem érkezik (nagy cégeknél több kör, max 5 kör).
        const ordered = Object.keys(townCounts).sort((a, b) => townCounts[b] - townCounts[a]);
        let projects = [], fetched = 0;
        const exactTotal = Object.keys(townCounts).reduce((s, t) => s + townCounts[t], 0);
        for (let round = 0; round < 5 && fetched < ordered.length; round++) {
          const batch = ordered.slice(fetched, fetched + 20);
          const parts = await Promise.all(batch.map(t =>
            env.KOSSZPENZ_KV.get('kosszpenz_tel_' + t, 'json').catch(() => null)));
          parts.forEach(r => { if (r && r.projects) projects = projects.concat(r.projects); });
          fetched += batch.length;
        }
        projects = projects.filter(p => normCompanyKey(p.winner) === nk);
        const euN = projects.length;
        // Hazai TED-sorok a kezdőbetű-shardból (RT-végződés mindkét normával).
        let ted = [];
        try {
          const ch = (nk[0] || '#');
          const shard = await env.KOSSZPENZ_KV.get(
            'kosszpenz_ted_co_X' + ch.charCodeAt(0).toString(16).toUpperCase(), 'json').catch(() => null);
          const nkRT = nk.replace(/ RT$/, '');
          if (shard) Object.keys(shard).forEach(k => {
            if (k === nk || k === nkRT) (shard[k] || []).forEach(p => ted.push(p));
          });
        } catch (e) {}
        ted = ted.map(p => Object.assign({ source: 'ted', type: 'hazai' }, p));
        projects = projects.concat(ted).sort((a, b) => b.amount_huf - a.amount_huf);
        return jsonResponse({ name, count: exactTotal + ted.length, eu_count: exactTotal,
          ted_count: ted.length, shown: projects.length,
          truncated: ordered.length > fetched, projects: projects.slice(0, 2000) });
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, { status: 500 });
      }
    }
    if (path === '/api/people' && request.method === 'GET') {
      // Személyek listája a cégháló-nézethez. Üres lista is érvényes állapot.
      if (env && env.KOSSZPENZ_KV) {
        try {
          const raw = await env.KOSSZPENZ_KV.get(KV_PEOPLE_KEY, 'json');
          if (raw && Array.isArray(raw.people)) {
            return jsonResponse({ count: raw.people.length, updated_at: raw.updated_at || null, people: raw.people });
          }
        } catch (e) { /* üres lista alább */ }
      }
      return jsonResponse({ count: 0, updated_at: null, people: [] });
    }
    if (path === '/api/people' && request.method === 'POST') {
      if (!checkAdmin(request, env)) {
        return jsonResponse({ success: false, error: 'Hiányzó vagy hibás API kulcs.' }, 401);
      }
      let body;
      try { body = await request.json(); }
      catch (e) { return jsonResponse({ success: false, error: 'Érvénytelen JSON törzs.' }, 400); }
      const people = Array.isArray(body.people) ? body.people : (body.person ? [body.person] : null);
      const validPerson = x => x && typeof x.name === 'string' && x.name.trim().length > 0
        && typeof x.company === 'string' && x.company.trim().length > 0;
      if (!people || people.length === 0 || !people.every(validPerson)) {
        return jsonResponse({ success: false, error: 'Hibás formátum: [{name, company, role?, share?}].' }, 400);
      }
      if (!env || !env.KOSSZPENZ_KV) {
        return jsonResponse({ success: false, error: 'KV binding hiányzik (KOSSZPENZ_KV).' }, 500);
      }
      const clean = people.map(x => ({
        name: String(x.name).trim().slice(0, 100),
        company: String(x.company).trim().slice(0, 100),
        role: String(x.role || '').trim().slice(0, 60),
        share: String(x.share || '').trim().slice(0, 20),
        source: String(x.source || '').trim().slice(0, 300)
      }));
      const prev = await env.KOSSZPENZ_KV.get(KV_PEOPLE_KEY, 'json').catch(() => null);
      const existing = Array.isArray(prev && prev.people) ? prev.people : [];
      const seen = new Set(existing.map(x =>
        (String(x.name || '').trim().toLowerCase() + '|' + String(x.company || '').trim().toLowerCase())));
      const fresh = clean.filter(x => {
        const k = x.name.trim().toLowerCase() + '|' + x.company.trim().toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const merged = [...existing, ...fresh];
      await env.KOSSZPENZ_KV.put(KV_PEOPLE_KEY, JSON.stringify({ people: merged, updated_at: new Date().toISOString() }));
      return jsonResponse({ success: true, count: merged.length, added: fresh.length, skipped: clean.length - fresh.length });
    }
    if (path === '/api/bounds' && request.method === 'GET') {
      // Településhatárok KV-ból, hosszú böngésző-cache-sel (változatlan adat).
      if (env && env.KOSSZPENZ_KV) {
        try {
          const raw = await env.KOSSZPENZ_KV.get('kosszpenz_bounds_v2');
          if (raw) {
            return new Response(raw, {
              headers: {
                'Content-Type': 'application/geo+json; charset=utf-8',
                'Cache-Control': 'public, max-age=31536000, immutable'
              }
            });
          }
        } catch (e) { /* 404 alább */ }
      }
      return new Response('Not Found', { status: 404 });
    }
    if (path === '/api/admin/put' && request.method === 'POST') {
      // Kötegelt KV-írás importhoz (ADMIN_KEY): {puts: [{key, value}], delete: [kulcsok]}.
      // Írható prefixek: koszpenz_* és kosszpenz_* (max 50/hívás, érték max 20 MB).
      // Törölni csak koszpenz_test_* prefixet lehet (harness takarítás).
      if (!checkAdmin(request, env)) {
        return jsonResponse({ success: false, error: 'Hiányzó vagy hibás API kulcs.' }, 401);
      }
      if (!env || !env.KOSSZPENZ_KV) {
        return jsonResponse({ success: false, error: 'KV binding hiányzik (KOSSZPENZ_KV).' }, 500);
      }
      let body;
      try { body = await request.json(); }
      catch (e) { return jsonResponse({ success: false, error: 'Érvénytelen JSON törzs.' }, 400); }
      const puts = Array.isArray(body.puts) ? body.puts.slice(0, 50) : [];
      const dels = Array.isArray(body.delete)
        ? body.delete.filter(k => String(k).startsWith('kosszpenz_test_') ||
          // egyszeri árva-takarítás: hibás prefixszel feltöltött TED-kulcsok
          String(k).startsWith('koszpenz_ted_')).slice(0, 50) : [];
      const okKey = k => typeof k === 'string' &&
        /^(koszpenz|kosszpenz)_[A-Za-z0-9_áéíóöőúüűÁÉÍÓÖŐÚÜŰ\-]+$/.test(k);
      let wrote = 0, deleted = 0;
      const errors = [];
      for (const it of puts) {
        try {
          if (!it || !okKey(it.key)) throw new Error('tiltott kulcs: ' + String(it && it.key).slice(0, 60));
          const s = JSON.stringify(it.value === undefined ? null : it.value);
          if (s.length > 20000000) throw new Error('túl nagy érték: ' + it.key);
          await env.KOSSZPENZ_KV.put(it.key, s);
          wrote++;
        } catch (e) { errors.push(String((e && e.message) || e).slice(0, 120)); }
      }
      for (const k of dels) {
        try { await env.KOSSZPENZ_KV.delete(k); deleted++; }
        catch (e) { errors.push(String((e && e.message) || e).slice(0, 120)); }
      }
      return jsonResponse({ success: errors.length === 0, wrote, deleted, errors: errors.slice(0, 10) });
    }
    if (path === '/api/admin/status' && request.method === 'GET') {
      // Kulcsszámlálás prefixre (import-verifikációhoz).
      if (!checkAdmin(request, env)) {
        return jsonResponse({ success: false, error: 'Hiányzó vagy hibás API kulcs.' }, 401);
      }
      if (!env || !env.KOSSZPENZ_KV) {
        return jsonResponse({ success: false, error: 'KV binding hiányzik (KOSSZPENZ_KV).' }, 500);
      }
      const prefix = String(url.searchParams.get('prefix') || 'kosszpenz_');
      if (!/^(koszpenz|kosszpenz)_/.test(prefix)) {
        return jsonResponse({ success: false, error: 'tiltott prefix' }, 400);
      }
      try {
        let cursor, count = 0;
        const sample = [];
        for (let i = 0; i < 20; i++) {
          const r = await env.KOSSZPENZ_KV.list({ prefix, limit: 1000, cursor });
          count += r.keys.length;
          if (sample.length < 5) r.keys.slice(0, 5 - sample.length).forEach(k => sample.push(k.name));
          if (r.list_complete) break;
          cursor = r.cursor;
          if (!cursor) break;
        }
        return jsonResponse({ success: true, prefix, count, sample });
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, 500);
      }
    }
    if (path === '/api/update' && request.method === 'POST') {
      // Egyedi projekt hozzáfűzése a darabolt tárolóhoz (év + település
      // kulcsok). Tömegeshez a kv_build.py offline szkript való; az
      // aggregátumokat az újraszámolja (lásd README).
      if (!checkAdmin(request, env)) {
        return jsonResponse({ success: false, error: 'Hiányzó vagy hibás API kulcs.' }, 401);
      }
      let body;
      try { body = await request.json(); }
      catch (e) { return jsonResponse({ success: false, error: 'Érvénytelen JSON törzs.' }, 400); }
      const items = Array.isArray(body.projects) ? body.projects.slice(0, 200) : (body.project ? [body.project] : null);
      if (!items || items.length === 0 || !items.every(validProject)) {
        return jsonResponse({ success: false, error: 'Hibás adatformátum. Lásd README.' }, 400);
      }
      if (!env || !env.KOSSZPENZ_KV) {
        return jsonResponse({ success: false, error: 'KV binding hiányzik (KOSSZPENZ_KV).' }, 500);
      }
      let appended = 0;
      for (const p of items) {
        const proj = {
          id: String(p.id), city: String(p.city), settlement: p.settlement || p.town || null,
          title: String(p.title), lat: (p.lat === '' || p.lat == null) ? null : Number(p.lat),
          lng: (p.lng === '' || p.lng == null) ? null : Number(p.lng),
          amount_huf: Number(p.amount_huf), type: p.type, date: String(p.date),
          winner: String(p.winner), programme: String(p.programme || '').slice(0, 100),
          fund: String(p.fund || '').slice(0, 20), url: String(p.url || '').slice(0, 300)
        };
        const yk = 'kosszpenz_ev_' + String(proj.date).slice(0, 4);
        try {
          const yr = await env.KOSSZPENZ_KV.get(yk, 'json').catch(() => null);
          const arr = (yr && yr.projects) || [];
          arr.push(proj);
          await env.KOSSZPENZ_KV.put(yk, JSON.stringify({ projects: arr }));
          appended++;
        } catch (e) { /* következő */ }
        if (proj.settlement) {
          try {
            const tk = 'kosszpenz_tel_' + proj.settlement;
            const tr = await env.KOSSZPENZ_KV.get(tk, 'json').catch(() => null);
            const arr = (tr && tr.projects) || [];
            if (!arr.some(x => x.id === proj.id)) arr.push(proj);
            await env.KOSSZPENZ_KV.put(tk, JSON.stringify({ projects: arr }));
          } catch (e) { /* következő */ }
        }
      }
      return jsonResponse({ success: true, appended, note: 'Az aggregátumokat (térkép, rangsorok) az offline újraszámolás frissíti.' });
    }
    return new Response('404 Not Found', { status: 404 });
}

// --- R2-alapú KV-pótló réteg ---
// A kosszpenz adatállomány KV-ból R2-be került ("kozpenz/" prefix). Ez a réteg
// a KV API-t utánozza, hogy a fenti kód változatlanul fusson.
function kozpenzKv(env) {
  const B = env.BESZOPTAK_IMAGES;
  const teljes = (k) => 'kozpenz/' + k;
  if (!B) {
    return {
      get: async () => null, put: async () => {}, delete: async () => {},
      list: async () => ({ keys: [], list_complete: true, cursor: undefined })
    };
  }
  return {
    async get(key, type) {
      const o = await B.get(teljes(key));
      if (!o) return null;
      if (type === 'json') return o.json();
      if (type === 'arrayBuffer') return o.arrayBuffer();
      if (type === 'stream') return o.body;
      return o.text();
    },
    async put(key, value) {
      const body = typeof value === 'string' ? value : JSON.stringify(value);
      await B.put(teljes(key), body, { httpMetadata: { contentType: 'application/json; charset=utf-8' } });
    },
    async delete(key) { await B.delete(teljes(key)); },
    async list(opts = {}) {
      const l = await B.list({ prefix: teljes(opts.prefix || ''), limit: opts.limit, cursor: opts.cursor });
      return {
        keys: l.objects.map(o => ({ name: o.key.slice('kozpenz/'.length) })),
        list_complete: !l.truncated,
        cursor: l.truncated ? l.cursor : undefined
      };
    }
  };
}

export async function kozpenzFetch(request, env, ctx) {
  const oenv = Object.assign({}, env, {
    KOSSZPENZ_KV: kozpenzKv(env),
    ADMIN_KEY: env.ADMIN_KEY || env.ADMIN_TOKEN || ''
  });
  return handleKozpenz(request, oenv, ctx);
}

export function kozpenzIndexHtml() {
  return renderIndexHtml();
}
