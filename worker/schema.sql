-- beszoptak.hu adatszerkezet
CREATE TABLE bejegyzesek (
  id TEXT PRIMARY KEY,
  sorrend INTEGER NOT NULL,
  adat TEXT NOT NULL
);

CREATE TABLE meta (
  kulcs TEXT PRIMARY KEY,
  ertek TEXT NOT NULL
);
