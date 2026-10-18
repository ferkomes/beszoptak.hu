(function () {
  const galeria = document.getElementById("galeria");
  const statisztika = document.getElementById("statisztika");
  const szuroGomb = document.querySelectorAll(".szuro");
  const keresesMezo = document.getElementById("kereses");

  // Állapot: több címke egyszerre (OR), + főkategória + keresés
  let kivalasztottKategoriak = [];
  let aktivFokat = null;
  let keresesSzoveg = "";

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

  function keplet(nev, kepek, logo) {
    if (logo) {
      return '<div class="monogram logo-tipus" style="background:' + logo.szin + '" title="' + logo.szoveg + '">' + logo.betu + "</div>";
    }
    if (kepek && kepek.length) {
      return '<img class="kep" src="' + kepek[0] + '" alt="' + nev + '" loading="lazy" ' +
        'onerror="this.outerHTML=\'<div class=&quot;monogram&quot; style=&quot;background:' + monogramSzin(nev) + '&quot;>' + monogramBetu(nev) + "</div>\" >";
    }
    return '<div class="monogram" style="background:' + monogramSzin(nev) + '">' + monogramBetu(nev) + "</div>";
  }

  function kisAvatar(kapcs) {
    if (kapcs.kepek && kapcs.kepek.length) {
      return '<img class="kis-kep" src="' + kapcs.kepek[0] + '" alt="' + kapcs.nev + '" loading="lazy" ' +
        'onerror="this.outerHTML=\'<div class=&quot;kis-monogram&quot; style=&quot;background:' + monogramSzin(kapcs.nev) + '&quot;>' + monogramBetu(kapcs.nev) + "</div>\" >";
    }
    return '<div class="kis-monogram" style="background:' + monogramSzin(kapcs.nev) + '">' + monogramBetu(kapcs.nev) + "</div>";
  }

  function kartyaHtml(bej) {
    const fokat = FOKATEGORIAK[bej.fokategoria];
    const bajszok =
      '<span class="bajsz fokat-bajsz" style="--fokat-szin:' + fokat.szin + '">' + fokat.emoji + " " + fokat.rovid + "</span>" +
      bej.kategoriak.map(function (k) {
        const meta = KATEGORIAK[k];
        return '<span class="bajsz ' + k + '">' + meta.emoji + " " + meta.nev + "</span>";
      }).join("");

    const kapcsolatok = bej.kapcsolatok.map(function (k) {
      return '<div class="kapcsolat">' + kisAvatar(k) +
        '<span><span class="nev">' + k.nev + '</span> – <span class="szerep">' + k.szerep + "</span></span></div>";
    }).join("");

    const ertek = bej.visszafizetett != null ? formatOsszeg(bej.visszafizetett) : bej.visszafizetett_szoveg;
    const szoveges = bej.visszafizetett == null;

    return '<article class="kartya" data-kat="' + bej.kategoriak.join(" ") + '" data-fokat="' + bej.fokategoria + '">' +
      '<div class="kartya-fej">' + keplet(bej.nev, bej.kepek, bej.logo) +
      '<div class="kartya-cim"><h2>' + bej.nev + '</h2><div class="tipus">' + bej.tipus + "</div></div></div>" +
      '<div class="kategoriak">' + bajszok + "</div>" +
      '<div class="osszeg-sor"><span class="cimke">' + (bej.osszeg_cimke || "Visszafizetve") + '</span><span class="ertek' + (szoveges ? " szoveg-ertek" : "") + '">' + ertek + "</span></div>" +
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

  function szur() {
    const lista = ADATOK.bejegyzesek.filter(function (b) {
      const katRendben = kivalasztottKategoriak.length === 0 ||
        b.kategoriak.some(function (k) { return kivalasztottKategoriak.indexOf(k) !== -1; });
      const fokatRendben = !aktivFokat || b.fokategoria === aktivFokat;
      const keresRendben = !keresesSzoveg || keresesiMezoSzoveg(b).indexOf(kereseszovegNormalize(keresesSzoveg)) !== -1;
      return katRendben && fokatRendben && keresRendben;
    });

    galeria.innerHTML = lista.length
      ? lista.map(kartyaHtml).join("")
      : '<p class="ures-uzenet">Nincs találat erre a szűrésre.</p>';

    szinkronizal();
  }

  function kereseszovegNormalize(sz) {
    return normalizal(sz);
  }

  function szinkronizal() {
    document.querySelectorAll(".szuro[data-kat]").forEach(function (g) {
      const kat = g.dataset.kat;
      const aktiv = kat === "mind"
        ? kivalasztottKategoriak.length === 0 && !aktivFokat
        : kivalasztottKategoriak.indexOf(kat) !== -1;
      g.classList.toggle("aktiv", aktiv);
    });
    document.querySelectorAll(".stat-doboz[data-szures]").forEach(function (d) {
      const tipus = d.dataset.szuresTipus;
      const ertek = d.dataset.szures;
      let aktiv = false;
      if (tipus === "mind") aktiv = kivalasztottKategoriak.length === 0 && !aktivFokat;
      else if (tipus === "kat") aktiv = kivalasztottKategoriak.indexOf(ertek) !== -1;
      else if (tipus === "fokat") aktiv = aktivFokat === ertek;
      d.classList.toggle("aktiv", aktiv);
    });
  }

  function nevekSorba(szurtBejegyzesek) {
    if (!szurtBejegyzesek.length) return '<span class="stat-nevek-ures">még senki</span>';
    return '<div class="stat-nevek">' + szurtBejegyzesek.map(function (b) { return b.nev; }).join(", ") + "</div>";
  }

  function statDoboz(cim, szam, szuresTipus, szuresErtek, nevekHtml, extraSzin) {
    return '<button class="stat-doboz' + (extraSzin ? " " + extraSzin : "") + '" ' +
      'data-szures="' + szuresErtek + '" data-szures-tipus="' + szuresTipus + '" type="button">' +
      '<div class="szam">' + szam + '</div><div class="cimke">' + cim + "</div>" + nevekHtml + "</button>";
  }

  function statisztikaFrisssit() {
    const osszesen = ADATOK.bejegyzesek.reduce(function (s, b) {
      return s + (typeof b.visszafizetett === "number" ? b.visszafizetett : 0);
    }, 0);
    const milliard = osszesen / 1e9;

    const fokatNevek = {};
    const katNevek = {};
    Object.keys(FOKATEGORIAK).forEach(function (k) { fokatNevek[k] = []; });
    Object.keys(KATEGORIAK).forEach(function (k) { katNevek[k] = []; });
    ADATOK.bejegyzesek.forEach(function (b) {
      fokatNevek[b.fokategoria].push(b);
      b.kategoriak.forEach(function (k) { katNevek[k].push(b); });
    });

    const dobozok =
      statDoboz("Nyilvántartott szereplő", ADATOK.bejegyzesek.length, "mind", "mind",
        '<div class="stat-nevek-csoportok">' +
        Object.keys(FOKATEGORIAK).map(function (fk) {
          return "<div><strong>" + FOKATEGORIAK[fk].emoji + " " + FOKATEGORIAK[fk].nev +
            " (" + fokatNevek[fk].length + ")</strong>: " +
            (fokatNevek[fk].length ? fokatNevek[fk].map(function (b) { return b.nev; }).join(", ") : "nincs") + "</div>";
        }).join("") + "</div>") +
      Object.keys(FOKATEGORIAK).map(function (fk) {
        return statDoboz(FOKATEGORIAK[fk].nev, fokatNevek[fk].length, "fokat", fk, nevekSorba(fokatNevek[fk]));
      }).join("") +
      Object.keys(KATEGORIAK).map(function (k) {
        return statDoboz(KATEGORIAK[k].emoji + " " + KATEGORIAK[k].nev, katNevek[k].length, "kat", k, nevekSorba(katNevek[k]), k);
      }).join("") +
      '<div class="stat-doboz nem-kattinthato"><div class="szam">≈ ' + milliard.toFixed(2).replace(".", ",") +
      ' Mrd Ft</div><div class="cimke">Visszakért összeg (ismert)</div></div>';

    statisztika.innerHTML = dobozok;

    statisztika.querySelectorAll(".stat-doboz[data-szures]").forEach(function (doboz) {
      doboz.addEventListener("click", function () {
        const tipus = doboz.dataset.szuresTipus;
        const ertek = doboz.dataset.szures;
        if (tipus === "mind") {
          kivalasztottKategoriak = [];
          aktivFokat = null;
        } else if (tipus === "kat") {
          kapcsoloKat(ertek);
        } else if (tipus === "fokat") {
          aktivFokat = aktivFokat === ertek ? null : ertek;
        }
        szur();
      });
    });
  }

  function kapcsoloKat(kat) {
    const i = kivalasztottKategoriak.indexOf(kat);
    if (i === -1) kivalasztottKategoriak.push(kat);
    else kivalasztottKategoriak.splice(i, 1);
  }

  szuroGomb.forEach(function (gomb) {
    gomb.addEventListener("click", function () {
      const kat = gomb.dataset.kat;
      if (kat === "mind") {
        kivalasztottKategoriak = [];
        aktivFokat = null;
      } else {
        kapcsoloKat(kat);
      }
      szur();
    });
  });

  keresesMezo.addEventListener("input", function () {
    keresesSzoveg = keresesMezo.value.trim();
    szur();
  });

  statisztikaFrisssit();
  szur();
})();
