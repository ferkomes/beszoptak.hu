// Beszoptak.hu - kategorizált szereplők adatai
// kategoria: "sitt" | "elozetes" | "felkeszul" | "kapta" | "visszafizetes"
// fokategoria: "maganszemely" | "kozeleti" | "ceg"
const ADATOK = {
  forras: "https://github.com/ferkomes/beszoptak.hu",
  frissitve: "2026-10-18",
  bejegyzesek: [
    {
      id: "kis-grofo",
      nev: "Kozák László (Kis Grófo)",
      tipus: "Mulatós zenész, előadóművész",
      fokategoria: "maganszemely",
      kepek: [],
      visszafizetett: 5000000,
      visszafizetett_szoveg: "5 000 000 Ft",
      kapcsolatok: [
        { nev: "Kozák László (Kis Grófo)", szerep: "pályázó", kepek: [] },
        { nev: "id. Kozák László", szerep: "néhai édesapja, a családi brand alapítója", kepek: [] }
      ],
      indok: "Új dalok megírására és megjelentetésére kapott könnyűzenei támogatás önkéntes visszafizetése.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "muri-eniko",
      nev: "Muri Enikő",
      tipus: "Énekesnő, előadóművész",
      fokategoria: "maganszemely",
      kepek: ["images/muri-eniko.jpg"],
      visszafizetett: 5000000,
      visszafizetett_szoveg: "5 000 000 Ft",
      kapcsolatok: [
        { nev: "Muri Enikő", szerep: "énekesnő", kepek: ["images/muri-eniko-kis.jpg"] },
        { nev: "Szakács Gergő", szerep: "alkotótárs / zenei közreműködő", kepek: [] }
      ],
      indok: "Könnyűzenei és előadóművészeti NKA pályázaton nyert támogatás önkéntes visszautalása.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "cseh-tamas",
      nev: "Cseh Tamás (magánszemély)",
      tipus: "Magánszemély / Pályázó",
      fokategoria: "maganszemely",
      kepek: [],
      visszafizetett: 8500000,
      visszafizetett_szoveg: "8 500 000 Ft",
      kapcsolatok: [
        { nev: "Cseh Tamás (pályázó magánszemély)", szerep: "pályázó", kepek: [] }
      ],
      indok: "Egyéni kulturális vagy alkotói célra megítélt ideiglenes kollégiumi keret visszafizetése.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "annus-istvan",
      nev: "Annus István József",
      tipus: "Magánszemély / Egyéni pályázó",
      fokategoria: "maganszemely",
      kepek: [],
      visszafizetett: 10000000,
      visszafizetett_szoveg: "10 000 000 Ft",
      kapcsolatok: [
        { nev: "Annus István József", szerep: "kedvezményezett", kepek: [] },
        { nev: "Tarr Zoltán", szerep: "kulturális miniszter, a felülvizsgálat elrendelője", kepek: [] }
      ],
      indok: "Közösségi és kulturális programok megvalósítására odaítélt ideiglenes keret teljes visszatérítése a minisztériumi felszólítás után.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "bander-jozsef",
      nev: "Bander József",
      tipus: "Magánszemély / Alkotó",
      fokategoria: "maganszemely",
      kepek: [],
      visszafizetett: 5000000,
      visszafizetett_szoveg: "5 000 000 Ft",
      kapcsolatok: [
        { nev: "Bander József", szerep: "pályázó", kepek: [] },
        { nev: "Hankó Balázs", szerep: "volt miniszter, a keret eredeti szétosztója", kepek: ["images/hanko-balazs-kis.jpg"] }
      ],
      indok: "Könnyűzenei produkció vagy zenei alkotói tevékenység elszámolási nehézségei miatt visszafizetett teljes támogatási összeg.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "papp-zoltan",
      nev: "Papp Zoltán",
      tipus: "Magánszemély / Kulturális menedzser",
      fokategoria: "maganszemely",
      kepek: [],
      visszafizetett: 4500000,
      visszafizetett_szoveg: "4 500 000 Ft",
      kapcsolatok: [
        { nev: "Papp Zoltán", szerep: "pályázó magánszemély", kepek: [] },
        { nev: "Pósfai Gábor", szerep: "belügyminiszter, a hatósági ellenőrzések koordinátora", kepek: [] }
      ],
      indok: "Kulturális rendezvények előkészítésére felvett ideiglenes kollégiumi támogatás önkéntes visszafizetése.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "szabo-istvan-pal",
      nev: "Szabó István Pál",
      tipus: "Magánszemély / Pályázó",
      fokategoria: "maganszemely",
      kepek: [],
      visszafizetett: 6000000,
      visszafizetett_szoveg: "6 000 000 Ft",
      kapcsolatok: [
        { nev: "Szabó István Pál", szerep: "kedvezményezett", kepek: [] },
        { nev: "Melléthei-Barna Márton", szerep: "igazságügyi miniszter, a jogi auditok felügyelője", kepek: [] }
      ],
      indok: "Művészeti projektre kapott támogatás visszautalása a kormányváltást követő átfogó elszámoltatási vizsgálat során.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "munkacsy-art",
      nev: "Munkácsy Art Kft. (Fásy-család)",
      tipus: "Kulturális és produkciós vállalkozás",
      fokategoria: "kozeleti",
      logo: { betu: "MA", szin: "#b45309", szoveg: "Munkácsy Art" },
      kepek: [],
      visszafizetett: null,
      visszafizetett_szoveg: "Maradéktalan kárrendezés (a kapott támogatás teljes összege)",
      kapcsolatok: [
        { nev: "Fásyné Gurzó Mária", szerep: "tulajdonos, büntetőeljárás alá vont gyanúsított", kepek: [] },
        { nev: "Fásy Ádám", szerep: "zenész, műsorvezető, férj", kepek: [] }
      ],
      indok: "El nem készült dokumentumfilm és fiktív költségek miatti költségvetési csalás büntetőeljárása során végrehajtott visszatérítés. 2026 szeptemberében a dokumentumfilm-ügyben két további gyanúsítottat vettek őrizetbe, köztük Fásyné Gurzó Máriát, akit előzetes letartóztatásba helyeztek.",
      kategoriak: ["visszafizetes", "elozetes"]
    },
    {
      id: "osszefogas-obuda",
      nev: "Összefogás Óbudáért Egyesület",
      tipus: "Politikai és civil szervezet",
      fokategoria: "kozeleti",
      logo: { betu: "ÖÓ", szin: "#1d4ed8", szoveg: "Óbuda" },
      kepek: [],
      visszafizetett: 20000000,
      visszafizetett_szoveg: "20 000 000 Ft",
      kapcsolatok: [
        { nev: "Bús Balázs", szerep: "Óbuda korábbi fideszes polgármestere, az NKA volt alelnöke – őrizetbe vett, jelenleg letartóztatásban", kepek: ["images/bus-balazs-kis.jpg"] },
        { nev: "Kiss László", szerep: "Óbuda polgármestere – az óbudai korrupciós és elszámolási szálak érintettjeként", kepek: [] }
      ],
      indok: "A NAV hűtlen kezelés és korrupció gyanúja miatti nyomozása nyomán elszámolási elégtelenségek miatt visszafizetett keret.",
      kategoriak: ["visszafizetes", "elozetes"]
    },
    {
      id: "varosliget",
      nev: "Városliget Ingatlanfejlesztő Zrt.",
      tipus: "Állami tulajdonú zártkörűen működő részvénytársaság",
      fokategoria: "ceg",
      logo: { betu: "VL", szin: "#047857", szoveg: "Városliget" },
      kepek: [],
      visszafizetett: 1250000000,
      visszafizetett_szoveg: "1 250 000 000 Ft",
      kapcsolatok: [
        { nev: "Baán László", szerep: "miniszteri biztos, a Liget Budapest projekt vezetője", kepek: ["images/baan-laszlo-kis.jpg"] },
        { nev: "Gyorgyevics Benedek", szerep: "vezérigazgató", kepek: [] }
      ],
      indok: "A Nemzeti Fotóművészeti Múzeumhoz kapcsolódó és egyéb kulturális projektek meg nem valósult, teljes egészében visszautalt támogatása.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "r56",
      nev: "R56 Nonprofit Kft.",
      tipus: "Vendéglátó és kulturális korlátolt felelősségű társaság",
      fokategoria: "ceg",
      logo: { betu: "R56", szin: "#b91c1c", szoveg: "R56 söröző" },
      kepek: [],
      visszafizetett: 289000000,
      visszafizetett_szoveg: "289 000 000 Ft",
      kapcsolatok: [
        { nev: "Stefka István", szerep: "kormányközeli újságíró, korábbi tulajdonos", kepek: [] },
        { nev: "Huth Gergely", szerep: "Pesti Srácok főszerkesztője, korábbi érdekelt", kepek: [] }
      ],
      indok: "A Bem rakparti fideszes törzshelyként működő R56 söröző és rendezvényközpont elszámolási felülvizsgálata nyomán visszautalt összeg.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "patr-event",
      nev: "Patr-Event Magyarország Kft.",
      tipus: "Rendezvényszervező és kommunikációs cég",
      fokategoria: "ceg",
      logo: { betu: "PE", szin: "#6d28d9", szoveg: "Patr-Event" },
      kepek: [],
      visszafizetett: 150000000,
      visszafizetett_szoveg: "150 000 000 Ft",
      kapcsolatok: [
        { nev: "Párkai Dávid", szerep: "tulajdonos, a Fidesz-frakció korábbi alkalmazottja", kepek: [] },
        { nev: "Kocsis Máté", szerep: "Fidesz frakcióvezető, akinek Párkai a személyi titkára volt", kepek: ["images/kocsis-mate-kis.jpg"] }
      ],
      indok: "Identitásformáló és közösségi események címszó alatt elnyert, de elszámolási problémák miatt részben vagy egészben visszafizetett támogatás.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "niu",
      nev: "Nemzeti Innovációs Ügynökség Nonprofit Zrt.",
      tipus: "Állami tulajdonú nonprofit részvénytársaság",
      fokategoria: "ceg",
      logo: { betu: "NIÜ", szin: "#0369a1", szoveg: "NIÜ" },
      kepek: [],
      visszafizetett: 146000000,
      visszafizetett_szoveg: "146 000 000 Ft",
      kapcsolatok: [
        { nev: "Bódis László", szerep: "vezérigazgató, a Kulturális és Innovációs Minisztérium volt helyettes államtitkára", kepek: [] },
        { nev: "Hankó Balázs", szerep: "kulturális és innovációs miniszter, az NIÜ felügyelője", kepek: ["images/hanko-balazs-kis.jpg"] }
      ],
      indok: "Meg nem valósult nagyszabású expó és innovációs bemutatók miatt visszaküldött NKA keretösszeg.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "samonok",
      nev: "Magyar Sámsonok Alapítvány",
      tipus: "Közhasznú sport és kulturális alapítvány",
      fokategoria: "ceg",
      logo: { betu: "MS", szin: "#c2410c", szoveg: "Magyar Sámsonok" },
      kepek: [],
      visszafizetett: 50000000,
      visszafizetett_szoveg: "50 000 000 Ft",
      kapcsolatok: [
        { nev: "Bárdosi Sándor", szerep: "olimpiai ezüstérmes birkózó, az alapítvány rendezvényeinek gyakori arca", kepek: [] },
        { nev: "Növényi Norbert", szerep: "olimpiai bajnok, kuratóriumokhoz/rendezvényekhez köthető sportoló", kepek: [] }
      ],
      indok: "Identitásőrző, sport- és kulturális programok hiányos elszámolása miatti önkéntes visszafizetés.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "diosgyor",
      nev: "Élhető Diósgyőrért Egyesület",
      tipus: "Helyi civil/álcivil szervezet",
      fokategoria: "ceg",
      logo: { betu: "ÉD", szin: "#a16207", szoveg: "Élhető Diósgyőrért" },
      kepek: [],
      visszafizetett: 50000000,
      visszafizetett_szoveg: "50 000 000 Ft",
      kapcsolatok: [
        { nev: "Kiss János", szerep: "Miskolc korábbi fideszes polgármester-jelöltje és országgyűlési képviselője", kepek: [] },
        { nev: "Alakszai Zoltán", szerep: "kormányhivatal-vezető, miskolci fideszes politikus", kepek: [] }
      ],
      indok: "Helyi közösségépítő és kulturális programok elmaradása vagy szabálytalan dokumentációja miatt visszafizetett összeg.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "civilek-csaladokert",
      nev: "Civilek a Családokért Egyesület",
      tipus: "Kormányközeli álcivil szervezet",
      fokategoria: "ceg",
      logo: { betu: "CC", szin: "#be185d", szoveg: "Civilek a Családokért" },
      kepek: [],
      visszafizetett: 20000000,
      visszafizetett_szoveg: "20 000 000 Ft",
      kapcsolatok: [
        { nev: "Tarr Zoltán", szerep: "kulturális miniszter", kepek: [] },
        { nev: "Kármán András", szerep: "pénzügyminiszter", kepek: [] }
      ],
      indok: "Családügyi és közösségépítő programok címen elnyert, de elmaradt vagy nem megfelelően igazolt rendezvények NKA-keretének teljes visszautalása.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "eletfa",
      nev: "Életfa Közösség- és Településépítő Egyesület",
      tipus: "Kulturális és területfejlesztési egyesület",
      fokategoria: "ceg",
      logo: { betu: "ÉK", szin: "#15803d", szoveg: "Életfa" },
      kepek: [],
      visszafizetett: 25000000,
      visszafizetett_szoveg: "25 000 000 Ft",
      kapcsolatok: [
        { nev: "Pósfai Gábor", szerep: "belügyminiszter", kepek: [] },
        { nev: "Tarr Zoltán", szerep: "kulturális miniszter", kepek: [] }
      ],
      indok: "Települési identitásőrző programok és zenés események hiányos elszámolása miatt önkéntesen visszafizetett NKA-forrás.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "hetenyvezer",
      nev: "Hetényvezér Kulturális és Közösségi Egyesület",
      tipus: "Hagyományőrző és kulturális szervezet",
      fokategoria: "ceg",
      logo: { betu: "HK", szin: "#7c2d12", szoveg: "Hetényvezér" },
      kepek: [],
      visszafizetett: 15000000,
      visszafizetett_szoveg: "15 000 000 Ft",
      kapcsolatok: [
        { nev: "Melléthei-Barna Márton", szerep: "igazságügyi miniszter", kepek: [] },
        { nev: "Hankó Balázs", szerep: "volt kulturális miniszter", kepek: ["images/hanko-balazs-kis.jpg"] }
      ],
      indok: "Hagyományőrző rendezvények és verses-zenés művészeti produkciók elmaradása miatt visszautalt ideiglenes kollégiumi támogatás.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "koros-torok",
      nev: "Körös-Torok Kultúrájáért Egyesület",
      tipus: "Kulturális és rendezvényszervező egyesület",
      fokategoria: "ceg",
      logo: { betu: "KT", szin: "#0e7490", szoveg: "Körös-Torok" },
      kepek: [],
      visszafizetett: 30000000,
      visszafizetett_szoveg: "30 000 000 Ft",
      kapcsolatok: [
        { nev: "Tarr Zoltán", szerep: "kulturális miniszter", kepek: [] },
        { nev: "Kármán András", szerep: "pénzügyminiszter", kepek: [] }
      ],
      indok: "Regionális könnyűzenei események és közösségi programok elszámolási szabálytalanságai miatt kényszerűen visszafizetett összeg.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "strazsa",
      nev: "Strázsa Közösségfejlesztésért Egyesület",
      tipus: "Térségfejlesztő civil szervezet",
      fokategoria: "ceg",
      logo: { betu: "SZ", szin: "#4d7c0f", szoveg: "Strázsa" },
      kepek: [],
      visszafizetett: 20000000,
      visszafizetett_szoveg: "20 000 000 Ft",
      kapcsolatok: [
        { nev: "Pósfai Gábor", szerep: "belügyminiszter", kepek: [] },
        { nev: "Tarr Zoltán", szerep: "kulturális miniszter", kepek: [] }
      ],
      indok: "Közösségi terek programjaira odaítélt, de a TISZA-kormány auditja során kifogásolt és emiatt visszautalt pályázati keret.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "terségi-korzó",
      nev: "Térségi Kulturális Korzó Egyesület",
      tipus: "Regionális kulturális szervezet",
      fokategoria: "ceg",
      logo: { betu: "TK", szin: "#7e22ce", szoveg: "Térségi Korzó" },
      kepek: [],
      visszafizetett: 18500000,
      visszafizetett_szoveg: "18 500 000 Ft",
      kapcsolatok: [
        { nev: "Melléthei-Barna Márton", szerep: "igazságügyi miniszter", kepek: [] },
        { nev: "Hankó Balázs", szerep: "volt miniszter", kepek: ["images/hanko-balazs-kis.jpg"] }
      ],
      indok: "Kulturális programsorozatok elégtelen dokumentációja és a hatósági eljárások elkerülése érdekében megtett önkéntes kárrendezés.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "cserkelo",
      nev: "Cserkelő Egyesület",
      tipus: "Környezetvédelmi és kulturális egyesület",
      fokategoria: "ceg",
      logo: { betu: "CS", szin: "#166534", szoveg: "Cserkelő" },
      kepek: [],
      visszafizetett: 12000000,
      visszafizetett_szoveg: "12 000 000 Ft",
      kapcsolatok: [
        { nev: "Tarr Zoltán", szerep: "kulturális miniszter", kepek: [] },
        { nev: "Pósfai Gábor", szerep: "belügyminiszter", kepek: [] }
      ],
      indok: "Természetközeli kulturális események címen elnyert ideiglenes kollégiumi támogatás felülvizsgálat utáni visszatérítése.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "hanko-balazs",
      nev: "Hankó Balázs",
      tipus: "Volt kulturális és innovációs miniszter, az NKA elnöke",
      fokategoria: "kozeleti",
      kepek: ["images/hanko-balazs.jpg"],
      visszafizetett: null,
      visszafizetett_szoveg: "A gyanú szerint 17,3 milliárd Ft eltérített közpénz",
      kapcsolatok: [
        { nev: "Varga-Bajusz Veronika", szerep: "egykori államtitkára, a gyanú szerinti bűntárs – letartóztatásban", kepek: [] },
        { nev: "Bús Balázs", szerep: "az NKA alelnöke, szintén őrizetbe vett", kepek: ["images/bus-balazs-kis.jpg"] },
        { nev: "Tarr Zoltán", szerep: "kulturális miniszter, az ügyet feltáró és elrendelő társa", kepek: [] }
      ],
      indok: "Mentelmi jogának felfüggesztése (2026. szept. 28.) után este őrizetbe vették, majd letartóztatták. A gyanú szerint a Kiemelt Kulturális Programok Ideiglenes Kollégiumát miniszterként, az NKA elnökeként vezetőjeként 1079 támogatói okirattal, 17,3 milliárd forintnyi vagyoni hátránnyal tömegesen, a jogszabályi céloktól eltérően – részben fideszes kampányeseményekre, választókerületenként – osztott szét. Letartóztatása jogerős és végleges (Kecskeméti Törvényszék, 2026. okt. 13.).",
      kategoriak: ["elozetes"]
    },
    {
      id: "varga-bajusz-veronika",
      nev: "Varga-Bajusz Veronika",
      tipus: "Volt államtitkár (KIM) – felsőoktatás, szak- és felnőttképzés, fiatalok",
      fokategoria: "kozeleti",
      kepek: ["images/varga-bajusz-veronika.jpg"],
      visszafizetett: null,
      visszafizetett_szoveg: "Vizsgálat alatt",
      kapcsolatok: [
        { nev: "Hankó Balázs", szerep: "volt minisztere, a gyanú szerinti bűntárs – letartóztatásban", kepek: ["images/hanko-balazs-kis.jpg"] }
      ],
      indok: "2026. szeptember 28-án Hankó Balázzsal együtt állították elő, október 1-jén a Kecskeméti Járásbíróság letartóztatta – vezetőszáron vitték a tárgyalásra. Október 13-án letartóztatása jogerőssé vált. Különösen jelentős vagyoni hátrányt okozó, bűnszövetségben elkövetett hűtlen kezeléssel gyanúsítják az NKA-ügyben.",
      kategoriak: ["elozetes"]
    },
    {
      id: "sesztak-miklos",
      nev: "Seszták Miklós",
      tipus: "Volt nemzeti fejlesztési miniszter, országgyűlési képviselő",
      fokategoria: "kozeleti",
      kepek: ["images/sesztak-miklos.jpg"],
      visszafizetett: null,
      visszafizetett_szoveg: "A gyanú szerint 12,6 milliárd Ft kenőpénz",
      kapcsolatok: [
        { nev: "Hankó Balázs", szerep: "szintén az NKA-ügyben őrizetbe vett volt miniszter", kepek: ["images/hanko-balazs-kis.jpg"] }
      ],
      indok: "Mentelmi jogának felfüggesztése után őrizetbe vették az NKA-ügyhöz kapcsolódóan. A gyanú szerint összesen 12,6 milliárd forint értékű kenőpénzt zsebre rakott.",
      kategoriak: ["elozetes"]
    },
    {
      id: "bus-balazs",
      nev: "Bús Balázs",
      tipus: "Az NKA volt alelnöke, Óbuda volt fideszes polgármestere",
      fokategoria: "kozeleti",
      kepek: ["images/bus-balazs.jpg"],
      visszafizetett: null,
      visszafizetett_szoveg: "Lásd: Összefogás Óbudáért Egyesület (20 millió Ft visszafizetve)",
      kapcsolatok: [
        { nev: "Ughy Attila", szerep: "a döntő kollégium vezetője, szintén őrizetbe vett", kepek: [] },
        { nev: "Kiss László", szerep: "Óbuda polgármestere – az óbudai szálak érintettje", kepek: [] }
      ],
      indok: "A botrány kirobbanása után ő volt az első, aki lemondott: az NKA alelnöki posztjáról távozott, majd 2026. június 23-án őrizetbe vették és gyanúsítottként hallgatták ki Kecskeméten. Hűtlen kezeléssel gyanúsítják, védője szerint részletes vallomást tett, letartóztatását kezdeményezték.",
      kategoriak: ["elozetes"]
    },
    {
      id: "ughy-attila",
      nev: "Ughy Attila",
      tipus: "A Kiemelt Kulturális Programok Ideiglenes Kollégiumának vezetője, volt fideszes képviselő",
      fokategoria: "kozeleti",
      kepek: [],
      visszafizetett: null,
      visszafizetett_szoveg: "Vizsgálat alatt",
      kapcsolatok: [
        { nev: "Hankó Balázs", szerep: "a kollégiumot felügyelő és irányító miniszter", kepek: ["images/hanko-balazs-kis.jpg"] },
        { nev: "Zámbó Nóra", szerep: "kollégiumi tag, minisztériumi titkárságvezető – szintén őrizetbe vett", kepek: [] },
        { nev: "Burom Gábor", szerep: "kollégiumi tag, kabinetfőnök-helyettes – szintén őrizetbe vett", kepek: [] }
      ],
      indok: "A 17 milliárd forint kiosztásáról döntő ideiglenes kollégium vezetőjeként 2026. június 23-án vették őrizetbe; letartóztatásban maradt. 2010–2019 között a XVIII. kerület polgármestere, korábbi fideszes országgyűlési képviselő volt, a botrány kirobbanása óta (május 6.) nem a Lechner Kft. munkavállalója.",
      kategoriak: ["elozetes"]
    },
    {
      id: "krucsaine-herter-aniko",
      nev: "Krucsainé Herter Anikó",
      tipus: "A Nemzeti Kulturális Támogatáskezelő (NKTK) volt főigazgatója",
      fokategoria: "tisztviselo",
      kepek: [],
      visszafizetett: null,
      visszafizetett_szoveg: "Vizsgálat alatt",
      kapcsolatok: [
        { nev: "Tarr Zoltán", szerep: "kulturális miniszter, aki május 19-én felmentette a posztjáról", kepek: [] },
        { nev: "Hankó Balázs", szerep: "a rábízott kifizetések felettese – letartóztatásban", kepek: ["images/hanko-balazs-kis.jpg"] }
      ],
      indok: "Az NKA-pályázatok lebonyolításával megbízott NKTK főigazgatója volt; Tarr Zoltán 2026. május 19-én mentette fel, június 23-án a NAV őrizetbe vette és gyanúsítottként hallgatta ki. Jogi képviselője később feljelentést tett, mondván: a támogatások egyedi kérelem alapján, szakmai egyeztetés nélkül, a főigazgató személyes utasítására kerültek kifizetésre.",
      kategoriak: ["elozetes"]
    },
    {
      id: "burom-gabor",
      nev: "Burom Gábor",
      tipus: "A Kulturális és Innovációs Minisztérium miniszteri kabinetfőnök-helyettese",
      fokategoria: "tisztviselo",
      kepek: [],
      visszafizetett: null,
      visszafizetett_szoveg: "Vizsgálat alatt",
      kapcsolatok: [
        { nev: "Hankó Balázs", szerep: "a miniszter, akinek a kabinetjében dolgozott – letartóztatásban", kepek: ["images/hanko-balazs-kis.jpg"] },
        { nev: "Ughy Attila", szerep: "a kollégium vezetője, szintén őrizetbe vett", kepek: [] }
      ],
      indok: "A 17 milliárd forint kiosztásáról döntő Kiemelt Kulturális Programok Ideiglenes Kollégiumának tagja; 2026. június 23-án a NAV őrizetbe vette és hűtlen kezelés gyanújával hallgatta ki a minisztériumban tartott kutatásokat követően.",
      kategoriak: ["elozetes"]
    },
    {
      id: "zambo-nora",
      nev: "Zámbó Nóra",
      tipus: "A KIM Közigazgatási Államtitkári Titkárságának főosztályvezetője, titkárságvezetője",
      fokategoria: "tisztviselo",
      kepek: [],
      visszafizetett: null,
      visszafizetett_szoveg: "Vizsgálat alatt",
      kapcsolatok: [
        { nev: "Ughy Attila", szerep: "a kollégium vezetője, szintén őrizetbe vett", kepek: [] },
        { nev: "Hankó Balázs", szerep: "volt miniszter – letartóztatásban", kepek: ["images/hanko-balazs-kis.jpg"] }
      ],
      indok: "A minisztériumi közigazgatási államtitkárságról a döntőbizottsági tagként került a Kiemelt Kulturális Programok Ideiglenes Kollégiumába; a NAV 2026. június 23-án őt is őrizetbe vette és gyanúsítottként hallgatta ki a 17 milliárdos NKA-ügyben.",
      kategoriak: ["elozetes"]
    },
    {
      id: "nktk-hatteremberek",
      nev: "NKTK-s és minisztériumi háttéremberek (több személy)",
      tipus: "Kormányzati alkalmazottak és cégvezetők – a döntések kevésbé ismert végrehajtói",
      fokategoria: "tisztviselo",
      logo: { betu: "NK", szin: "#475569", szoveg: "NKTK / KIM" },
      kepek: [],
      visszafizetett: null,
      visszafizetett_szoveg: "A hatóságok vizsgálják",
      kapcsolatok: [
        { nev: "Papp Gergely", szerep: "NKTK-projektmenedzser – ő szivárogtatta ki a 17 milliárdos nem nyilvános keretet Molnár Áronnak; ezután őt és környezetét indoklás nélkül kizárták a belső rendszerekből", kepek: [] },
        { nev: "Krucsainé Herter Anikó", szerep: "a volt főigazgató – szintén őrizetbe vett", kepek: [] }
      ],
      indok: "Az NKTK és a KIM egykori és jelenlegi alkalmazottai, akiket a NAV őrizetbe vett: egy részük neve a szélesebb nyilvánosság számára kevésbé ismert. 2026. szeptember 7-én újabb két személyt állítottak elő egy 80 millió forint feletti, el sem készült dokumentumfilm fiktív számlákkal leplezett elszámolása miatt. Szeptember közepén összesen négyen voltak letartóztatásban, öten bűnügyi felügyelet alatt; a gyanúsítottak között volt olyan, aki ma is az NKTK alkalmazásában áll.",
      kategoriak: ["elozetes"]
    },
    {
      id: "balasy-gyula",
      nev: "Balásy Gyula",
      tipus: "Médiavállalkozó – a NER egykori kedvence, a Lounge-csoport tulajdonosa",
      fokategoria: "kozeleti",
      kepek: [],
      visszafizetett: null,
      visszafizetett_szoveg: "Cégeit ingyen átadta az államnak (~80 Mrd Ft értékben)",
      kapcsolatok: [
        { nev: "Ruszin-Szendi Romulusz", szerep: "honvédelmi miniszter – feljelentést tett ellene", kepek: [] },
        { nev: "Nemzeti Kommunikációs Hivatal", szerep: "a korábbi 300+ milliárdos közbeszerzések gazdája", kepek: [] }
      ],
      indok: "2026 májusában közjegyző előtt aláírt okiratban lemondott négy cége (Lounge Design, Lounge Event, New Land Media, Visual Europe) üzletrészeiről, és felajánlotta azokat – értéküket kb. 80 milliárd forintra becsülve –, valamint magántőkealap-befektetéseit az államnak, miután bankszámláikat zárolták. A cégek ellen büntetőeljárás és végrehajtás indult, a Miniszterelnökség, a közmédia és a Nemzeti Rendezvényszervező Ügynökség is felmondta a szerződéseit; a CRCB elemzése szerint 2011 óta ~1135 milliárd forintnyi közpénzhez jutottak.",
      kategoriak: ["felkeszul"]
    },
    {
      id: "szijjarto-peter",
      nev: "Szijjártó Péter",
      tipus: "Volt külgazdasági és külügyminiszter, jelenleg a BYD-nál",
      fokategoria: "kozeleti",
      kepek: ["images/szijjarto-peter.jpg"],
      visszafizetett: null,
      visszafizetett_szoveg: "Büntetőfeljelentés – kb. 1 millió eurós kár",
      kapcsolatok: [
        { nev: "Külgazdasági és Külügyminisztérium", szerep: "a belső audit, amely feltárta a repülőgép-bérlési gyakorlatot", kepek: [] }
      ],
      indok: "A Külgazdasági és Külügyminisztérium belső auditja után hivatalos büntetőfeljelentés született a tárca korábbi magánrepülőgép-bérlési gyakorlata miatt (feleslegesen kifizetett luxusutak, kb. 1 millió eurós kár). Az eljárás folyik, előzetesben nincs; ő jelenleg a versenyszférában, a BYD-nál dolgozik.",
      kategoriak: ["felkeszul"]
    },
    {
      id: "matolcsy-gyorgy",
      nev: "Matolcsy György és Matolcsy Ádám",
      tipus: "Az MNB volt elnöke és fia – a jegybanki alapítványok ügyében",
      fokategoria: "kozeleti",
      kepek: ["images/matolcsy-gyorgy.jpg"],
      visszafizetett: null,
      visszafizetett_szoveg: "Elszámoltatás előkészítése alatt",
      kapcsolatok: [
        { nev: "Matolcsy György", szerep: "volt MNB-elnök", kepek: ["images/matolcsy-gyorgy-kis.jpg"] },
        { nev: "Matolcsy Ádám", szerep: "fia – az alapítványi kifizetések érintettje", kepek: [] }
      ],
      indok: "Az MNB-ügyeket és a jegybanki alapítványok kifizetéseit vizsgáló országgyűlési bizottság hivatalosan is beidézheti őket elszámoltatásra. Az eljárás előkészítése folyik, előzetes letartóztatás egyikük esetében sincs.",
      kategoriak: ["felkeszul"]
    },
    {
      id: "szakacs-istvan",
      nev: "Szakács István",
      tipus: "Fidesz-közeli (megafonos) influenszer",
      fokategoria: "maganszemely",
      kepek: [],
      visszafizetett: null,
      visszafizetett_szoveg: "Nyomozás megszüntetve (bizonyítottság hiányában)",
      kapcsolatok: [
        { nev: "Nemzeti Nyomozó Iroda", szerep: "a nyomozást megszüntető hatóság", kepek: [] }
      ],
      indok: "2026 júliusában terrorcselekmény elkövetésével fenyegetés gyanújával hallgatták ki és bilincsben vitték be, miután egy videóban Orbán Viktor esetleges elviteléről és kiszabadításáról beszélt. A Nemzeti Nyomozó Iroda október 16-án bizonyítottság hiányában megszüntette ellene a nyomozást; az ügyészség a feljelentő panaszát is elutasította.",
      kategoriak: ["felkeszul"]
    },
    {
      id: "toth-gabi",
      nev: "Tóth Gabi",
      tipus: "Énekesnő, előadóművész",
      fokategoria: "maganszemely",
      kepek: ["images/toth-gabi.jpg"],
      visszafizetett: null,
      osszeg_cimke: "Kapott összeg",
      visszafizetett_szoveg: "5 000 000 Ft + cége 9 000 000 Ft",
      kapcsolatok: [
        { nev: "Tóth Gabi", szerep: "pályázó magánszemély", kepek: ["images/toth-gabi-kis.jpg"] },
        { nev: "Tóth Gabi és párja közös cége", szerep: "a 9 milliós támogatás kedvezményezettje", kepek: [] }
      ],
      indok: "A Fidesz kampányában fellépő előadóművészek között ő is az NKA kiemelt keretéből kapott: magánszemélyként 5 milliót, a párjával közös cégén keresztül további 9 milliót. Egyike a legtöbbet emlegetett kedvezményezetteknek, pénzt eddig nem adott vissza.",
      kategoriak: ["kapta"]
    },
    {
      id: "dopeman",
      nev: "Dopeman (Papp Máté)",
      tipus: "Rapper, előadóművész",
      fokategoria: "maganszemely",
      kepek: ["images/dopeman.jpg"],
      visszafizetett: null,
      osszeg_cimke: "Kapott összeg",
      visszafizetett_szoveg: "5 000 000 Ft",
      kapcsolatok: [
        { nev: "Dopeman", szerep: "pályázó", kepek: ["images/dopeman-kis.jpg"] },
        { nev: "Hankó Balázs", szerep: "a kereteket osztó volt miniszter – letartóztatásban", kepek: ["images/hanko-balazs-kis.jpg"] }
      ],
      indok: "Könnyűzenei támogatásként 5 millió forintot kapott az NKA ideiglenes kollégiumi keretéből. Visszafizetni eddig nem fizetett, a NAV nyomozásba egyelőre nem vonták be.",
      kategoriak: ["kapta"]
    },
    {
      id: "deak-bill-gyula",
      nev: "Deák Bill Gyula",
      tipus: "Énekes, előadóművész (Kossuth-díjas)",
      fokategoria: "maganszemely",
      kepek: ["images/deak-bill-gyula.jpg"],
      visszafizetett: null,
      osszeg_cimke: "Kapott összeg",
      visszafizetett_szoveg: "100 000 000 Ft",
      kapcsolatok: [
        { nev: "Deák Bill Gyula", szerep: "kedvezményezett", kepek: ["images/deak-bill-gyula-kis.jpg"] },
        { nev: "Balásy Gyula", szerep: "a cégháló középpontjában – cégeit átadta az államnak", kepek: [] }
      ],
      indok: "A „legenda nemzeti turné” elnevezésű projekt kapott 100 millió forintot. Az összeg a Balásy Gyula érdekeltségébe tartozó cégeken keresztül csorgott, a NAV a turné számláit is vizsgálja; a pénzt eddig nem adta vissza.",
      kategoriak: ["kapta"]
    },
    {
      id: "pataky-attila",
      nev: "Pataky Attila és cége",
      tipus: "Énekes, előadóművész / vállalkozás",
      fokategoria: "maganszemely",
      kepek: ["images/pataky-attila.jpg"],
      visszafizetett: null,
      osszeg_cimke: "Kapott összeg",
      visszafizetett_szoveg: "150 000 000 Ft (cégen keresztül)",
      kapcsolatok: [
        { nev: "Pataky Attila", szerep: "előadóművész, a cége tulajdonosa", kepek: ["images/pataky-attila-kis.jpg"] },
        { nev: "Mága Zoltán hivatalos fotósának cége", szerep: "szintén kedvezményezett – 500 millióval", kepek: [] }
      ],
      indok: "Az előadó érdekeltségébe tartozó cég 150 millió forintos támogatást kapott az NKA-tól. Az összeg nagyságrendje a közvéleményben a leginkább kifogásolt tételek közé tartozik; visszafizetés nem történt.",
      kategoriak: ["kapta"]
    },
    {
      id: "maga-foto-ceg",
      nev: "Mága Zoltán hivatalos fotósának cége",
      tipus: "Cég (a fotós neve nem nyilvános)",
      fokategoria: "ceg",
      kepek: [],
      logo: { betu: "MF", szin: "#7c3aed", szoveg: "Mága Zoltán hivatalos fotósának cége" },
      visszafizetett: null,
      osszeg_cimke: "Kapott összeg",
      visszafizetett_szoveg: "500 000 000 Ft",
      kapcsolatok: [
        { nev: "Mága Zoltán", szerep: "hegedűművész, aki a fotósa fellépésein kíséri", kepek: ["images/maga-zoltan-kis.jpg"] },
        { nev: "Balásy Gyula", szerep: "a céghálóban szereplő rendezvényszervező", kepek: [] }
      ],
      indok: "Fél milliárd forintot kapott az NKA-tól egy olyan cég, amely Mága Zoltán hivatalos fotósának a nevén volt bejegyezve – a támogatás célja „kulturális tartalomgyártás” volt. Az összeg a Balásy-birodalomhoz köthető számlázási lánc részeként jelent meg; a pénz nem került vissza.",
      kategoriak: ["kapta"]
    }
  ]
};

const KATEGORIAK = {
  sitt: { nev: "Sittre került", leiras: "Elítélés / végrehajtás", szin: "#dc2626", emoji: "⛓️" },
  elozetes: { nev: "Előzetesben / őrizetben", leiras: "Gyanúsítottként őrizetbe véve, letartóztatásban", szin: "#d97706", emoji: "🚔" },
  felkeszul: { nev: "Eljárás folyik", leiras: "Akik ellen már folyik az eljárás, de (még) nincsenek előzetesben", szin: "#8b5cf6", emoji: "⚖️" },
  kapta: { nev: "Kapta a pénzt", leiras: "Kedvezményezett – a pénz nála landolt, egyelőre nem adta vissza", szin: "#eab308", emoji: "💰" },
  visszafizetes: { nev: "Visszaadta a pénzt", leiras: "Önként vagy felszólításra visszautalt", szin: "#059669", emoji: "💸" }
};

const FOKATEGORIAK = {
  maganszemely: { nev: "Magánszemély, zenész", rovid: "Magánszemély", emoji: "🎤", szin: "#38bdf8" },
  kozeleti: { nev: "Politikus, közszereplő", rovid: "Közszereplő", emoji: "🏛️", szin: "#f472b6" },
  tisztviselo: { nev: "Kormányzati tisztviselő, háttérember", rovid: "Tisztviselő", emoji: "🗂️", szin: "#fbbf24" },
  ceg: { nev: "Cég, alapítvány, egyesület", rovid: "Cég / szervezet", emoji: "🏢", szin: "#a3e635" }
};
