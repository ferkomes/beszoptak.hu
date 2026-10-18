(function () {
  const galeria = document.getElementById("galeria");
  const statisztika = document.getElementById("statisztika");
  const szuroGomb = document.querySelectorAll(".szuro");
  const keresesMezo = document.getElementById("kereses");

  let aktivKat = "mind";
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
    const bajszok = bej.kategoriak.map(function (k) {
      const meta = KATEGORIAK[k];
      return '<span class="bajsz ' + k + '">' + meta.emoji + " " + meta.nev + "</span>";
    }).join("");

    const kapcsolatok = bej.kapcsolatok.map(function (k) {
      return '<div class="kapcsolat">' + kisAvatar(k) +
        '<span><span class="nev">' + k.nev + '</span> – <span class="szerep">' + k.szerep + "</span></span></div>";
    }).join("");

    const ertek = bej.visszafizetett != null ? formatOsszeg(bej.visszafizetett) : bej.visszafizetett_szoveg;
    const szoveges = bej.visszafizetett == null;

    return '<article class="kartya" data-kat="' + bej.kategoriak.join(" ") + '" ' +
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

  function szur() {
    const lista = ADATOK.bejegyzesek.filter(function (b) {
      const katRendben = aktivKat === "mind" || b.kategoriak.indexOf(aktivKat) !== -1;
      const keresRendben = !keresesSzoveg ||
        (b.nev + " " + b.tipus + " " + b.indok + " " + b.kapcsolatok.map(function (k) { return k.nev + " " + k.szerep; }).join(" "))
          .toLowerCase().indexOf(keresesSzoveg) !== -1;
      return katRendben && keresRendben;
    });

    galeria.innerHTML = lista.length
      ? lista.map(kartyaHtml).join("")
      : '<p class="ures-uzenet">Nincs találat erre a szűrésre.</p>';
  }

  function statisztikaFrisssit() {
    const szamlalok = { sitt: 0, elozetes: 0, visszafizetes: 0 };
    let osszesen = 0;
    ADATOK.bejegyzesek.forEach(function (b) {
      b.kategoriak.forEach(function (k) { szamlalok[k]++; });
      if (typeof b.visszafizetett === "number") osszesen += b.visszafizetett;
    });

    const milliard = osszesen / 1e9;
    statisztika.innerHTML =
      '<div class="stat-doboz"><div class="szam">' + ADATOK.bejegyzesek.length + '</div><div class="cimke">Nyilvántartott szereplő</div></div>' +
      '<div class="stat-doboz sitt"><div class="szam">' + szamlalok.sitt + '</div><div class="cimke">Sittre került</div></div>' +
      '<div class="stat-doboz elozetes"><div class="szam">' + szamlalok.elozetes + '</div><div class="cimke">Előzetesben / őrizetben</div></div>' +
      '<div class="stat-doboz visszafizetes"><div class="szam">' + szamlalok.visszafizetes + '</div><div class="cimke">Visszaadta a pénzt</div></div>' +
      '<div class="stat-doboz"><div class="szam">≈ ' + milliard.toFixed(2).replace(".", ",") + ' Mrd Ft</div><div class="cimke">Visszakért összeg (ismert)</div></div>';
  }

  szuroGomb.forEach(function (gomb) {
    gomb.addEventListener("click", function () {
      szuroGomb.forEach(function (g) { g.classList.remove("aktiv"); });
      gomb.classList.add("aktiv");
      aktivKat = gomb.dataset.kat;
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
