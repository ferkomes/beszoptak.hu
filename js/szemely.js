(function () {
  const API_BASE = "https://beszoptak-api.ferkomes.workers.dev";
  const API = API_BASE + "/api/adat";
  const API_PEOPLE = API_BASE + "/api/people";

  const HELYI_ADAT = typeof ADATOK !== "undefined" ? ADATOK : null;
  const HELYI_KATEG = typeof KATEGORIAK !== "undefined" ? KATEGORIAK : null;
  const HELYI_FOK = typeof FOKATEGORIAK !== "undefined" ? FOKATEGORIAK : null;

  let KATEG = {};
  let FOK = {};

  const gyoker = document.getElementById("szemely");
  const nev = (new URLSearchParams(location.search).get("nev") || "").trim();

  const SZINEK_PERSONA = ["#334e68", "#3e5c76", "#2f4858", "#486581", "#527d95", "#2c5282", "#3d5a80", "#4a5568"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function normalizal(szoveg) {
    return (szoveg || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ő/g, "o")
      .replace(/ű/g, "u")
      .replace(/\s+/g, " ")
      .trim();
  }

  function egyezik(a, b) {
    return normalizal(a) === normalizal(b);
  }

  function monogramSzin(n) {
    let sum = 0;
    for (let i = 0; i < n.length; i++) sum += n.charCodeAt(i);
    return SZINEK_PERSONA[sum % SZINEK_PERSONA.length];
  }

  function monogramBetu(n) {
    const szavak = n.replace(/[()]/g, "").trim().split(/\s+/);
    if (szavak.length === 1) return szavak[0].slice(0, 2).toUpperCase();
    return (szavak[0][0] + szavak[1][0]).toUpperCase();
  }

  function formatOsszeg(ertek) {
    if (ertek == null) return null;
    return ertek.toLocaleString("hu-HU") + " Ft";
  }

  function keplet(n, kepek, logo) {
    if (kepek && kepek.length) {
      return '<img class="kep" src="' + kepek[0] + '" alt="' + esc(n) + '" loading="lazy" title="Nagyítás" ' +
        'onerror="this.outerHTML=\'<div class=&quot;monogram&quot; style=&quot;background:' + monogramSzin(n) + '&quot;>' + monogramBetu(n) + "</div>\" >";
    }
    if (logo) {
      return '<div class="monogram logo-tipus" style="background:' + logo.szin + '" title="' + esc(logo.szoveg) + '">' + logo.betu + "</div>";
    }
    return '<div class="monogram" style="background:' + monogramSzin(n) + '">' + monogramBetu(n) + "</div>";
  }

  function bajszokHtml(bej) {
    const fokat = FOK[bej.fokategoria];
    let s = fokat
      ? '<span class="bajsz fokat-bajsz" style="--fokat-szin:' + fokat.szin + '">' + fokat.emoji + " " + fokat.rovid + "</span>"
      : "";
    s += bej.kategoriak.map(function (k) {
      const m = KATEG[k];
      return m ? '<span class="bajsz ' + k + '">' + m.emoji + " " + m.nev + "</span>" : "";
    }).join("");
    return s;
  }

  function ures(szoveg) {
    gyoker.innerHTML = '<p class="ures-uzenet">' + szoveg +
      '<br><a class="szemely-ugras" href="/">Vissza a főoldalra</a></p>';
  }

  function esetHtml(t) {
    const b = t.bej;
    const ertek = b.visszafizetett != null ? formatOsszeg(b.visszafizetett) : b.visszafizetett_szoveg;
    const szoveges = b.visszafizetett == null;
    let szerep;
    if (t.fo && t.kapcs.length) {
      szerep = "A bejegyzés főszereplője; kapcsolódó szerep: " + t.kapcs.map(function (k) { return k.szerep; }).join(", ");
    } else if (t.fo) {
      szerep = "A bejegyzés főszereplője";
    } else {
      szerep = t.kapcs.map(function (k) { return k.szerep; }).join(", ");
    }
    return '<article class="szemely-eset" id="eset-' + b.id + '">' +
      '<div class="szemely-eset-fej">' + keplet(b.nev, b.kepek, b.logo) +
      '<div><h3>' + esc(b.nev) + '</h3><div class="tipus">' + esc(b.tipus) + "</div></div></div>" +
      '<div class="kategoriak">' + bajszokHtml(b) + "</div>" +
      (ertek ? '<div class="osszeg-sor"><span class="cimke">' + esc(b.osszeg_cimke || "Összeg") + '</span><span class="ertek' + (szoveges ? " szoveg-ertek" : "") + '">' + ertek + "</span></div>" : "") +
      '<p class="szemely-szerep">Szerep: <b>' + esc(szerep) + "</b></p>" +
      '<div class="indok"><p class="indok-szoveg">' + b.indok + "</p></div>" +
      '<a class="szemely-ugras" href="/#bej-' + b.id + '">Ugrás az esethez →</a>' +
      "</article>";
  }

  function render(adat) {
    KATEG = adat.kategoriak || HELYI_KATEG || {};
    FOK = adat.fokategoriak || HELYI_FOK || {};

    if (!nev) { ures("Nincs megadva személy."); return; }

    const talalatok = [];
    adat.bejegyzesek.forEach(function (b) {
      const fo = egyezik(b.nev, nev);
      const kapcs = (b.kapcsolatok || []).filter(function (k) { return egyezik(k.nev, nev); });
      if (fo || kapcs.length) talalatok.push({ bej: b, fo: fo, kapcs: kapcs });
    });

    if (!talalatok.length) { ures("Ehhez a névhez nincs találat: " + esc(nev)); return; }

    const kepek = [];
    talalatok.forEach(function (t) {
      if (t.fo && t.bej.kepek) kepek.push.apply(kepek, t.bej.kepek);
      t.kapcs.forEach(function (k) { if (k.kepek) kepek.push.apply(kepek, k.kepek); });
    });

    const katSet = {};
    talalatok.forEach(function (t) {
      (t.bej.kategoriak || []).forEach(function (k) { katSet[k] = (katSet[k] || 0) + 1; });
    });

    let vissza = 0;
    talalatok.forEach(function (t) { if (t.fo && t.bej.visszafizetett != null) vissza += t.bej.visszafizetett; });

    let html = '<section class="szemely-fej">' + keplet(nev, kepek) +
      '<div><h2 class="szemely-nev">' + esc(nev) + "</h2>" +
      '<p class="szemely-alcim">' + talalatok.length + " érintett eset" +
      (vissza ? " · " + formatOsszeg(vissza) + " visszafizetve" : "") + "</p>" +
      '<div class="kategoriak">' +
      Object.keys(katSet).map(function (k) {
        const m = KATEG[k];
        return m ? '<span class="bajsz ' + k + '">' + m.emoji + " " + m.nev + "</span>" : "";
      }).join("") +
      "</div></div></section>";

    html += '<h3 class="szemely-szekcio-cim">Érintett esetek</h3>';
    html += talalatok.map(esetHtml).join("");

    gyoker.innerHTML = html;

    kozpenzSzekcio();
  }

  function kozpenzSzekcio() {
    const ido = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined;
    fetch(API_PEOPLE, { signal: ido })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        const lista = ((d && d.people) || []).filter(function (p) { return egyezik(p.name, nev); });
        if (!lista.length) return;
        const szekcio = document.createElement("section");
        szekcio.innerHTML = '<h3 class="szemely-szekcio-cim">Céges érintettség (közpénz-adatbázis)</h3>' +
          '<p class="szemely-megj">A közpénz cégháló szerint az alábbi cégekben volt vagy van szerepe.</p>' +
          lista.map(function (p) {
            return '<div class="szemely-ceg"><div><span class="ceg-nev">' + esc(p.company) + "</span>" +
              (p.role ? ' <span class="ceg-szerep">' + esc(p.role) + "</span>" : "") + "</div>" +
              (p.share ? '<span class="ceg-resz">' + esc(p.share) + "</span>" : "") + "</div>";
          }).join("");
        gyoker.appendChild(szekcio);
      })
      .catch(function () {});
  }

  // Képnagyító
  const nagyito = document.getElementById("nagyito");
  const nagyitoKep = document.getElementById("nagyito-kep");
  const nagyitoFelirat = document.getElementById("nagyito-felirat");

  function nagyitNyit(img) {
    const eredeti = img.src;
    const nagyMeret = img.classList.contains("kis-kep")
      ? eredeti.replace(/-kis(\.\w+)([?#].*)?$/, "$1$2")
      : eredeti;
    const tartalek = nagyMeret === eredeti ? null : eredeti;
    nagyitoKep.onerror = function () {
      if (tartalek && nagyitoKep.src !== tartalek) nagyitoKep.src = tartalek;
      else nagyitoKep.onerror = null;
    };
    nagyitoKep.src = nagyMeret;
    nagyitoFelirat.textContent = img.alt || "";
    nagyito.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function nagyitZar() {
    nagyito.hidden = true;
    nagyitoKep.onerror = null;
    nagyitoKep.src = "";
    document.body.style.overflow = "";
  }

  gyoker.addEventListener("click", function (e) {
    const img = e.target.closest ? e.target.closest("img.kep, img.kis-kep") : null;
    if (img) { e.preventDefault(); nagyitNyit(img); }
  });

  nagyito.addEventListener("click", function (e) {
    if (e.target === nagyito || (e.target.closest && e.target.closest(".nagyito-zar"))) nagyitZar();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nagyito && !nagyito.hidden) nagyitZar();
  });

  const idok = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined;
  fetch(API, { signal: idok })
    .then(function (r) {
      if (!r.ok) throw new Error("status " + r.status);
      return r.json();
    })
    .then(function (d) {
      if (!d || !d.bejegyzesek || !d.bejegyzesek.length) throw new Error("ures valasz");
      render(d);
    })
    .catch(function () {
      if (HELYI_ADAT && HELYI_ADAT.bejegyzesek && HELYI_ADAT.bejegyzesek.length) {
        render(Object.assign({}, HELYI_ADAT, { kategoriak: HELYI_KATEG, fokategoriak: HELYI_FOK }));
      } else {
        ures("Az adatok betöltése sikertelen – töltsd újra az oldalt.");
      }
    });
})();
