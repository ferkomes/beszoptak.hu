// Beszoptak.hu - kategorizált szereplők adatai
// kategoria: "sitt" | "elozetes" | "visszafizetes"
const ADATOK = {
  forras: "https://github.com/ferkomes/beszoptak.hu",
  frissitve: "2026-10-18",
  bejegyzesek: [
    {
      id: "kis-grofo",
      nev: "Kozák László (Kis Grófo)",
      tipus: "Mulatós zenész, előadóművész",
      szemely: true,
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
      szemely: true,
      kepek: [
        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/A_Dal_2017_Muri_Enik%C5%91_2016-12-08.jpg/440px-A_Dal_2017_Muri_Enik%C5%91_2016-12-08.jpg"
      ],
      visszafizetett: 5000000,
      visszafizetett_szoveg: "5 000 000 Ft",
      kapcsolatok: [
        { nev: "Muri Enikő", szerep: "énekesnő", kepek: ["https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/A_Dal_2017_Muri_Enik%C5%91_2016-12-08.jpg/110px-A_Dal_2017_Muri_Enik%C5%91_2016-12-08.jpg"] },
        { nev: "Szakács Gergő", szerep: "alkotótárs / zenei közreműködő", kepek: [] }
      ],
      indok: "Könnyűzenei és előadóművészeti NKA pályázaton nyert támogatás önkéntes visszautalása.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "cseh-tamas",
      nev: "Cseh Tamás (magánszemély)",
      tipus: "Magánszemély / Pályázó",
      szemely: true,
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
      id: "munkacsy-art",
      nev: "Munkácsy Art Kft. (Fásy-család)",
      tipus: "Kulturális és produkciós vállalkozás",
      szemely: false,
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
      szemely: false,
      logo: { betu: "ÖÓ", szin: "#1d4ed8", szoveg: "Óbuda" },
      kepek: [],
      visszafizetett: 20000000,
      visszafizetett_szoveg: "20 000 000 Ft",
      kapcsolatok: [
        { nev: "Bús Balázs", szerep: "Óbuda korábbi fideszes polgármestere, az NKA volt alelnöke, őrizetbe vett gyanúsított", kepek: ["https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/B%C3%BAs_Bal%C3%A1zs.jpg/110px-B%C3%BAs_Bal%C3%A1zs.jpg"] },
        { nev: "Kiss László", szerep: "Óbuda polgármestere – az óbudai korrupciós és elszámolási szálak érintettjeként", kepek: [] }
      ],
      indok: "A NAV hűtlen kezelés és korrupció gyanúja miatti nyomozása nyomán elszámolási elégtelenségek miatt visszafizetett keret.",
      kategoriak: ["visszafizetes", "elozetes"]
    },
    {
      id: "varosliget",
      nev: "Városliget Ingatlanfejlesztő Zrt.",
      tipus: "Állami tulajdonú zártkörűen működő részvénytársaság",
      szemely: false,
      logo: { betu: "VL", szin: "#047857", szoveg: "Városliget" },
      kepek: [],
      visszafizetett: 1250000000,
      visszafizetett_szoveg: "1 250 000 000 Ft",
      kapcsolatok: [
        { nev: "Baán László", szerep: "miniszteri biztos, a Liget Budapest projekt vezetője", kepek: ["https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Ba%C3%A1n_L%C3%A1szl%C3%B3.jpg/110px-Ba%C3%A1n_L%C3%A1szl%C3%B3.jpg"] },
        { nev: "Gyorgyevics Benedek", szerep: "vezérigazgató", kepek: [] }
      ],
      indok: "A Nemzeti Fotóművészeti Múzeumhoz kapcsolódó és egyéb kulturális projektek meg nem valósult, teljes egészében visszautalt támogatása.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "r56",
      nev: "R56 Nonprofit Kft.",
      tipus: "Vendéglátó és kulturális korlátolt felelősségű társaság",
      szemely: false,
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
      szemely: false,
      logo: { betu: "PE", szin: "#6d28d9", szoveg: "Patr-Event" },
      kepek: [],
      visszafizetett: 150000000,
      visszafizetett_szoveg: "150 000 000 Ft",
      kapcsolatok: [
        { nev: "Párkai Dávid", szerep: "tulajdonos, a Fidesz-frakció korábbi alkalmazottja", kepek: [] },
        { nev: "Kocsis Máté", szerep: "Fidesz frakcióvezető, akinek Párkai a személyi titkára volt", kepek: ["https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Kocsis_M%C3%A1t%C3%A9_20190831_100918542.jpg/110px-Kocsis_M%C3%A1t%C3%A9_20190831_100918542.jpg"] }
      ],
      indok: "Identitásformáló és közösségi események címszó alatt elnyert, de elszámolási problémák miatt részben vagy egészben visszafizetett támogatás.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "niu",
      nev: "Nemzeti Innovációs Ügynökség Nonprofit Zrt.",
      tipus: "Állami tulajdonú nonprofit részvénytársaság",
      szemely: false,
      logo: { betu: "NIÜ", szin: "#0369a1", szoveg: "NIÜ" },
      kepek: [],
      visszafizetett: 146000000,
      visszafizetett_szoveg: "146 000 000 Ft",
      kapcsolatok: [
        { nev: "Bódis László", szerep: "vezérigazgató, a Kulturális és Innovációs Minisztérium volt helyettes államtitkára", kepek: [] },
        { nev: "Hankó Balázs", szerep: "kulturális és innovációs miniszter, az NIÜ felügyelője", kepek: ["https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Hank%C3%B3_Bal%C3%A1zs_in_2025_01.jpg/110px-Hank%C3%B3_Bal%C3%A1zs_in_2025_01.jpg"] }
      ],
      indok: "Meg nem valósult nagyszabású expó és innovációs bemutatók miatt visszaküldött NKA keretösszeg.",
      kategoriak: ["visszafizetes"]
    },
    {
      id: "samonok",
      nev: "Magyar Sámsonok Alapítvány",
      tipus: "Közhasznú sport és kulturális alapítvány",
      szemely: false,
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
      szemely: false,
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
    }
  ]
};

const KATEGORIAK = {
  sitt: { nev: "Sittre került", leiras: "Elítélés / végrehajtás", szin: "#dc2626", emoji: "⛓️" },
  elozetes: { nev: "Előzetesben / őrizetben", leiras: "Gyanúsítottként őrizetbe véve", szin: "#d97706", emoji: "🚔" },
  visszafizetes: { nev: "Visszaadta a pénzt", leiras: "Önként vagy felszólításra visszautalt", szin: "#059669", emoji: "💸" }
};
