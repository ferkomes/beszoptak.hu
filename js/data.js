// Beszoptak.hu - kategorizált szereplők adatai
// kategoria: "sitt" | "elozetes" | "visszafizetes"
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
      indok: "El nem készült dokumentumfilm és fiktív költségek miatti költségvetési csalás büntetőeljárása során végrehajtott visszatérítés.",
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
        { nev: "Bús Balázs", szerep: "Óbuda korábbi fideszes polgármestere, az NKA volt alelnöke, őrizetbe vett gyanúsított", kepek: ["images/bus-balazs-kis.jpg"] },
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
    }
  ]
};

const KATEGORIAK = {
  sitt: { nev: "Sittre került", leiras: "Elítélés / végrehajtás", szin: "#dc2626", emoji: "⛓️" },
  elozetes: { nev: "Előzetesben / őrizetben", leiras: "Gyanúsítottként őrizetbe véve", szin: "#d97706", emoji: "🚔" },
  visszafizetes: { nev: "Visszaadta a pénzt", leiras: "Önként vagy felszólításra visszautalt", szin: "#059669", emoji: "💸" }
};

const FOKATEGORIAK = {
  maganszemely: { nev: "Magánszemély, zenész", rovid: "Magánszemély", emoji: "🎤", szin: "#38bdf8" },
  kozeleti: { nev: "Politikus, közszereplő", rovid: "Közszereplő", emoji: "🏛️", szin: "#f472b6" },
  ceg: { nev: "Cég, alapítvány, egyesület", rovid: "Cég / szervezet", emoji: "🏢", szin: "#a3e635" }
};
