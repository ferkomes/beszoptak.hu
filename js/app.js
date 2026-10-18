(function () {
  const galeria = document.getElementById("galeria");
  const statisztika = document.getElementById("statisztika");
  const szuroGomb = document.querySelectorAll(".szuro");
  const keresesMezo = document.getElementById("kereses");

  // szures: { tipus: "mind" | "kat" | "fokat", ertek: string }
  let szures = { tipus: "mind", ertek: "mind" };
  let keresesSzoveg = "";

  const SZINEK_PERSONA = ["#334e68", "#3e5c76", "#2f4858", "#486581", "#527d95", "#2c5282", "#3d5a80", "#4a5568"];

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

    return '<article class="kartya" data-kat="' + bej.kategoriak.join(" ") + '" data-fokat="' + bej.fokategoria + '" ' +
      'data-kereses="' + (bej.nev + " " + bej.tipus + " " + bej.kapcsolatok.map(function (k) { return k.nev; }).join(" ")).toLowerCase() + '">' +
      '<div class="kartya-fej">' + keplet(bej.nev, bej.kepek, bej.logo) +
      '<div class="kartya-cim"><h2>' + bej.nev + '</h2><div class="tipus">' + bej.tipus + "</div></div></div>" +
      '<div class="kategoriak">' + bajszok + "</div>" +
      '<div class="osszeg-sor"><span class="cimke">Visszafizetve</span><span class="ertek' + (szoveges ? " szoveg-ertek" : "") + '">' + ertek + "</span></div>" +
      '<div class="test">' +
      '<div class="kapcsolatok"><div class="reszlecim">Kapcsolódó kulcsemberek</div><div class="kapcsolat-lista">' + kapcsolatok + "</div></div>" +
      '<div class="indok"><div class="reszlecim">Jogcím / indok</div><p class="indok-szoveg">' + bej.indok + "</p></div>" +
      "</div></article>";
  }

  function szuresRendben(bej, sz) {
    if (sz.tipus === "mind") return true;
    if (sz.tipus === "kat") return bej.kategoriak.indexOf(sz.ertek) !== -1;
    if (sz.tipus === "fokat") return bej.fokategoria === sz.ertek;
    return true;
  }

  function szur() {
    const lista = ADATOK.bejegyzesek.filter(function (b) {
      const szurRendben = szuresRendben(b, szures);
      const keresRendben = !keresesSzoveg ||
        (b.nev + " " + b.tipus + " " + b.indok + " " + b.kapcsolatok.map(function (k) { return k.nev + " " + k.szerep; }).join(" "))
          .toLowerCase().indexOf(keresSzoveg) !== -1;
      return szurRendben && keresRendben;
    });

    galeria.innerHTML = lista.length
      ? lista.map(kartyaHtml).join("")
      : '<p class="ures-uzenet">Nincs találat erre a szűrésre.</p>';

    szuroGomb.forEach(function (g) {
      const aktiv = szures.tipus === "kat" && g.dataset.kat === szures.ertek;
      g.classList.toggle("aktiv", aktiv);
    });
    document.querySelectorAll(".stat-doboz[data-szures]").forEach(function (d) {
      const aktiv = (d.dataset.szuresTipus === "mind" && szures.tipus === "mind") ||
        (d.dataset.szuresTipus === szures.tipus && d.dataset.szures === szures.ertek);
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
    const katNevek = { sitt: [], elozetes: [], visszafizetes: [] };
    Object.keys(FOKATEGORIAK).forEach(function (k) { fokatNevek[k] = []; });
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
        const ujTipus = doboz.dataset.szuresTipus;
        const ujErtek = doboz.dataset.szures;
        if (szures.tipus === ujTipus && szures.ertek === ujErtek) {
          szures = { tipus: "mind", ertek: "mind" };
        } else {
          szures = { tipus: ujTipus, ertek: ujErtek };
        }
        szur();
        document.querySelector(".szurok").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  szuroGomb.forEach(function (gomb) {
    gomb.addEventListener("click", function () {
      szures = { tipus: "kat", ertek: gomb.dataset.kat };
      szur();
    });
  });

  keresesMezo.addEventListener("input", function () {
    keresesSzoveg = keresesMezo.value.trim().toLowerCase();
    szur();
  });

  statisztikaFrisssit();
  szur();
})();
