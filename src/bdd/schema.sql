-- Schema de la base Verif Achats.
--
-- Deux principes structurent ce schema :
--
-- 1. Les montants sont des ENTIERS de centimes d'ariary. Aucun REAL nulle
--    part sur un montant : un flottant en base finirait par produire un total
--    faux, et un total faux sur un bon de commande se paie en vrai.
--
-- 2. Les lignes de document portent des COPIES (snapshots) du nom, de la
--    reference, du fournisseur et du prix. Un document signe doit rester
--    lisible et exact meme si le produit est archive ou son prix renegocie
--    dix fois ensuite. C'est la regle "la synchronisation ne modifie jamais
--    les documents historiques", appliquee par la structure et non par la
--    discipline du code.

pragma journal_mode = wal;
pragma foreign_keys = on;

-- ---------------------------------------------------------------- catalogue

create table if not exists produit (
  id                       integer primary key autoincrement,
  source_produit_id        integer not null unique,
  nom                      text    not null,
  nom_normalise            text    not null,
  code_produit_a           text,
  code_produit_n           text,
  famille                  text,
  unite                    text,
  a_photo                  integer not null default 0,
  actif                    integer not null default 1,
  derniere_synchronisation text,
  cree_le                  text    not null,
  modifie_le               text    not null
);

create index if not exists idx_produit_nom_normalise on produit (nom_normalise);
create index if not exists idx_produit_actif on produit (actif);

create table if not exists tiers (
  id              integer primary key autoincrement,
  source_tiers_id integer not null unique,
  code            text,
  nom             text,
  qualite         text    not null default 'inconnue',
  actif           integer not null default 1,
  cree_le         text    not null,
  modifie_le      text    not null
);

create index if not exists idx_tiers_code on tiers (code);

-- Un tarif = un prix negocie entre un tiers et un produit. C'est l'unite que
-- l'utilisateur ajoute a un document : on n'achete pas "du ciment", on achete
-- "du ciment chez tel fournisseur a tel prix".
create table if not exists tarif (
  id                    integer primary key autoincrement,
  source_ligne_id       integer not null unique,
  produit_id            integer references produit (id) on delete set null,
  tiers_id              integer references tiers (id) on delete set null,
  designation_libre     text,
  designation_normalisee text,
  code_chez_tiers       text,
  prix_centimes         integer,
  prix_lu_centimes      integer,
  echelle               text    not null default 'ariary_certain',
  echelle_corrigee      integer not null default 0,
  echelle_incertaine    integer not null default 0,
  date_tarif            text,
  actif                 integer not null default 1,
  societe               text,
  import_id             integer references import_catalogue (id) on delete set null,
  cree_le               text    not null,
  modifie_le            text    not null
);

create index if not exists idx_tarif_produit on tarif (produit_id);
create index if not exists idx_tarif_tiers on tarif (tiers_id);
create index if not exists idx_tarif_prix on tarif (prix_centimes);

-- Index de recherche plein texte.
-- unicode61 + remove_diacritics 2 rend la recherche insensible aux accents et
-- a la casse sans qu'on ait a dupliquer les libelles nous-memes.
-- Le rowid vaut toujours tarif.id : c'est ce qui relie l'index a la donnee.
create virtual table if not exists tarif_recherche using fts5 (
  libelle,
  code,
  fournisseur,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- ---------------------------------------------------------------- documents

create table if not exists document (
  id              integer primary key autoincrement,
  numero          text    not null unique,
  type            text    not null,
  date_document   text    not null,
  statut          text    not null default 'brouillon',
  tiers_libelle   text,
  notes           text,
  devise          text    not null default 'MGA',
  total_centimes  integer not null default 0,
  cree_par        text,
  cree_le         text    not null,
  modifie_le      text    not null
);

create index if not exists idx_document_statut on document (statut);
create index if not exists idx_document_date on document (date_document);

create table if not exists ligne_document (
  id                          integer primary key autoincrement,
  document_id                 integer not null references document (id) on delete cascade,
  numero_ligne                integer not null,
  -- Les references restent nullables : un produit archive ne doit jamais
  -- empecher de relire un ancien document.
  produit_id                  integer references produit (id) on delete set null,
  tarif_id                    integer references tarif (id) on delete set null,
  nom_produit_snapshot        text    not null,
  reference_snapshot          text,
  fournisseur_snapshot        text,
  unite_snapshot              text,
  prix_catalogue_snapshot_centimes integer,
  prix_unitaire_centimes      integer not null,
  prix_modifie_manuellement   integer not null default 0,
  quantite_milliemes          integer not null,
  sous_total_centimes         integer not null,
  cree_le                     text    not null
);

create index if not exists idx_ligne_document on ligne_document (document_id);

-- ------------------------------------------------------------------ imports

create table if not exists import_catalogue (
  id                       integer primary key autoincrement,
  nom_fichier              text    not null,
  date_import              text    not null,
  utilisateur              text,
  statut                   text    not null,
  nombre_lignes_analysees  integer not null default 0,
  nombre_produits_nouveaux integer not null default 0,
  nombre_produits_maj      integer not null default 0,
  nombre_produits_inchanges integer not null default 0,
  nombre_produits_archives integer not null default 0,
  nombre_lignes_ignorees   integer not null default 0,
  nombre_erreurs           integer not null default 0,
  rapport_json             text    not null,
  cree_le                  text    not null
);

create table if not exists historique_produit (
  id                  integer primary key autoincrement,
  produit_id          integer references produit (id) on delete cascade,
  import_id           integer references import_catalogue (id) on delete set null,
  type_modification   text    not null,
  champ_modifie       text,
  ancienne_valeur     text,
  nouvelle_valeur     text,
  utilisateur         text,
  date_modification   text    not null
);

create index if not exists idx_historique_produit on historique_produit (produit_id);

-- Compteur des numeros de document, par type et par annee.
create table if not exists compteur_document (
  type   text    not null,
  annee  integer not null,
  valeur integer not null default 0,
  primary key (type, annee)
);
