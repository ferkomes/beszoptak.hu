(function () {
  const API = "https://beszoptak-api.ferkomes.workers.dev/api/adat";

  // Helyi tartalék (js/data.js) – csak akkor fut, ha az API nem elérhető
  const HELYI_ADAT = typeof ADATOK !== "undefined" ? ADATOK : null;
  const HELYI_KATEG = typeof KATEGORIAK !== "undefined" ? KATEGORIAK : null;
  const HELYI_FOK = typeof FOKATEGORIAK !== "undefined" ? FOKATEGORIAK : null;

  let ADAT = null;
  let KATEG = null;
  let FOK = null;

  const galeria = document.getElementById("galeria");
  const szuroGomb = document.querySelectorAll(".szuro");
  const keresesMezo = document.getElementById("kereses");
  const szamlaloMezo = document.getElementById("szamlalo");
  const szamlaloResz = document.getElementById("szamlalo-resz");

  let aktivKat = "mind";
  let keresesSzoveg = "";
  let szamlaloErtek = 0;
  let szamlaloAnim = null;

  const SZINEK_PERSONA = ["#334e68", "#3e5c76", "#2f4858", "#486581", "#527d95", "#2c5282", "#3d5a80", "#4a5568"];

  function normalizal(szoveg) {
    return (szoveg || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ő/g, "o")
      .replace(/ű/g, "u");
  }

  function monogramSzin(nev) {
    let sum = 0;
    for (let i = 0; i < nev.length; i++) sum += nev.charCodeAt(i);
    return SZINEK_PERSONA[sum % SZINEK_PERSONA.length];
  }

  function monogramBetu(nev) {
    const szavak = nev.replace(/[()]/g, "").trim().split(/\s+/);
    if (szavak.length === 1) return szavak[0].slice(0, 2).toUpperCase();
    return (szavak[0][0] + szavak[1][0]).toUpperCase();
  }

  function formatOsszeg(ertek) {
    if (ertek == null) return null;
    return ertek.toLocaleString("hu-HU") + " Ft";
  }

  function szemelyLink(nev) {
    return "szemely?nev=" + encodeURIComponent(nev);
  }

  function keplet(nev, kepek, logo) {
    if (kepek && kepek.length) {
      return '<img class="kep" src="' + kepek[0] + '" alt="' + nev + '" loading="lazy" title="Nagyítás" ' +
        'onerror="this.outerHTML=\'<div class=&quot;monogram&quot; style=&quot;background:' + monogramSzin(nev) + '&quot;>' + monogramBetu(nev) + "</div>\" >";
    }
    if (logo) {
      return '<div class="monogram logo-tipus" style="background:' + logo.szin + '" title="' + logo.szoveg + '">' + logo.betu + "</div>";
    }
    return '<div class="monogram" style="background:' + monogramSzin(nev) + '">' + monogramBetu(nev) + "</div>";
  }

  function kisAvatar(kapcs) {
    if (kapcs.kepek && kapcs.kepek.length) {
      return '<img class="kis-kep" src="' + kapcs.kepek[0] + '" alt="' + kapcs.nev + '" loading="lazy" title="Nagyítás" ' +
        'onerror="this.outerHTML=\'<div class=&quot;kis-monogram&quot; style=&quot;background:' + monogramSzin(kapcs.nev) + '&quot;>' + monogramBetu(kapcs.nev) + "</div>\" >";
    }
    return '<div class="kis-monogram" style="background:' + monogramSzin(kapcs.nev) + '">' + monogramBetu(kapcs.nev) + "</div>";
  }

  function kartyaHtml(bej) {
    const fokat = FOK[bej.fokategoria];
    const bajszok =
      '<span class="bajsz fokat-bajsz" style="--fokat-szin:' + fokat.szin + '">' + fokat.emoji + " " + fokat.rovid + "</span>" +
      bej.kategoriak.map(function (k) {
        const meta = KATEG[k];
        return meta ? '<span class="bajsz ' + k + '">' + meta.emoji + " " + meta.nev + "</span>" : "";
      }).join("");

    const kapcsolatok = bej.kapcsolatok.map(function (k) {
      return '<div class="kapcsolat">' + kisAvatar(k) +
        '<span><a class="szemely-link" href="' + szemelyLink(k.nev) + '"><span class="nev">' + k.nev + '</span></a> – <span class="szerep">' + k.szerep + "</span></span></div>";
    }).join("");

    const ertek = bej.visszafizetett != null ? formatOsszeg(bej.visszafizetett) : bej.visszafizetett_szoveg;
    const szoveges = bej.visszafizetett == null;
    const alapCimke =
      bej.visszafizetett != null ? "Visszafizetve" :
      bej.kategoriak.indexOf("elozetes") !== -1 ? "Előzetesben" :
      bej.kategoriak.indexOf("felkeszul") !== -1 ? "Felkészül" :
      bej.kategoriak.indexOf("tanu") !== -1 ? "Felmentve" :
      bej.kategoriak.indexOf("kapta") !== -1 ? "Kapott összeg" :
      "Státusz";

    return '<article class="kartya" id="bej-' + bej.id + '" data-kat="' + bej.kategoriak.join(" ") + '" data-fokat="' + bej.fokategoria + '">' +
      '<div class="kartya-fej">' + keplet(bej.nev, bej.kepek, bej.logo) +
      '<div class="kartya-cim"><h2><a class="szemely-link" href="' + szemelyLink(bej.nev) + '">' + bej.nev + "</a></h2><div class=\"tipus\">" + bej.tipus + "</div></div></div>" +
      '<div class="kategoriak">' + bajszok + "</div>" +
      '<div class="osszeg-sor"><span class="cimke">' + (bej.osszeg_cimke || alapCimke) + '</span><span class="ertek' + (szoveges ? " szoveg-ertek" : "") + '">' + ertek + "</span></div>" +
      '<div class="test">' +
      '<div class="kapcsolatok"><div class="reszlecim">Kapcsolódó kulcsemberek</div><div class="kapcsolat-lista">' + kapcsolatok + "</div></div>" +
      '<div class="indok"><div class="reszlecim">Jogcím / indok</div><p class="indok-szoveg">' + bej.indok + "</p></div>" +
      "</div></article>";
  }

  function keresesiMezoSzoveg(bej) {
    return normalizal(
      bej.nev + " " + bej.tipus + " " + bej.indok + " " +
      bej.kapcsolatok.map(function (k) { return k.nev + " " + k.szerep; }).join(" ")
    );
  }

  function szamlaloAllit(cel, darab) {
    if (szamlaloResz) {
      szamlaloResz.textContent = darab
        ? darab + " szereplő adta eddig vissza"
        : "erre a szűrésre nincs visszafizetés";
    }
    if (!szamlaloMezo) return;
    if (typeof requestAnimationFrame !== "function") {
      szamlaloErtek = cel;
      szamlaloMezo.textContent = cel.toLocaleString("hu-HU");
      return;
    }
    const kezd = szamlaloErtek;
    const inditas = performance.now();
    if (szamlaloAnim) cancelAnimationFrame(szamlaloAnim);
    function leptet(most) {
      const t = Math.min(1, (most - inditas) / 700);
      const e = 1 - Math.pow(1 - t, 3);
      szamlaloMezo.textContent = Math.round(kezd + (cel - kezd) * e).toLocaleString("hu-HU");
      if (t < 1) {
        szamlaloAnim = requestAnimationFrame(leptet);
      } else {
        szamlaloErtek = cel;
        szamlaloAnim = null;
      }
    }
    szamlaloAnim = requestAnimationFrame(leptet);
  }

  function szur() {
    const lista = ADAT.bejegyzesek.filter(function (b) {
      const katRendben = aktivKat === "mind" || b.kategoriak.indexOf(aktivKat) !== -1;
      const keresRendben = !keresesSzoveg || keresesiMezoSzoveg(b).indexOf(normalizal(keresesSzoveg)) !== -1;
      return katRendben && keresRendben;
    });

    galeria.innerHTML = lista.length
      ? lista.map(kartyaHtml).join("")
      : '<p class="ures-uzenet">Nincs találat erre a szűrésre.</p>';

    let osszeg = 0;
    let darab = 0;
    lista.forEach(function (b) {
      if (b.visszafizetett != null) {
        osszeg += b.visszafizetett;
        darab++;
      }
    });
    szamlaloAllit(osszeg, darab);

    szinkronizal();
    hashKezel();
  }

  function hashKezel() {
    if (!location.hash) return;
    const cel = document.getElementById(location.hash.slice(1));
    if (!cel) return;
    cel.scrollIntoView({ behavior: "smooth", block: "center" });
    cel.classList.add("kiemelt");
    setTimeout(function () { cel.classList.remove("kiemelt"); }, 2600);
  }

  function szinkronizal() {
    document.querySelectorAll(".szuro[data-kat]").forEach(function (g) {
      g.classList.toggle("aktiv", g.dataset.kat === aktivKat);
    });
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
      if (tartalek && nagyitoKep.src !== tartalek) {
        nagyitoKep.src = tartalek;
      } else {
        nagyitoKep.onerror = null;
      }
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

  galeria.addEventListener("click", function (e) {
    const img = e.target.closest ? e.target.closest("img.kep, img.kis-kep") : null;
    if (img) {
      e.preventDefault();
      nagyitNyit(img);
    }
  });

  nagyito.addEventListener("click", function (e) {
    if (e.target === nagyito || (e.target.closest && e.target.closest(".nagyito-zar"))) nagyitZar();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nagyito && !nagyito.hidden) nagyitZar();
  });

  function init(adat) {
    ADAT = adat;
    KATEG = adat.kategoriak || HELYI_KATEG || {};
    FOK = adat.fokategoriak || HELYI_FOK || {};
    szur();
  }

  szuroGomb.forEach(function (gomb) {
    gomb.addEventListener("click", function () {
      aktivKat = gomb.dataset.kat;
      keresesMezo.value = "";
      keresesSzoveg = "";
      szur();
    });
  });

  keresesMezo.addEventListener("input", function () {
    keresesSzoveg = keresesMezo.value.trim();
    szur();
  });

  window.addEventListener("hashchange", hashKezel);

  const idok = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined;
  fetch(API, { signal: idok })
    .then(function (r) {
      if (!r.ok) throw new Error("status " + r.status);
      return r.json();
    })
    .then(function (d) {
      if (!d || !d.bejegyzesek || !d.bejegyzesek.length) throw new Error("ures valasz");
      init(d);
    })
    .catch(function () {
      if (HELYI_ADAT && HELYI_ADAT.bejegyzesek && HELYI_ADAT.bejegyzesek.length) {
        init(Object.assign({}, HELYI_ADAT, {
          kategoriak: HELYI_KATEG,
          fokategoriak: HELYI_FOK,
        }));
      } else {
        galeria.innerHTML = '<p class="ures-uzenet">Az adatok betöltése sikertelen – töltsd újra az oldalt.</p>';
      }
    });
})();
