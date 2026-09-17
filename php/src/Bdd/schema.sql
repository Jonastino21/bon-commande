-- Schema MySQL de Verif Achats. Portage de src/bdd/schema.sql (SQLite).
--
-- Deux principes structurent ce schema :
--
-- 1. Les montants sont des ENTIERS de centimes d'ariary, en BIGINT. Aucun
--    FLOAT ni DECIMAL nulle part sur un montant : un flottant en base finirait
--    par produire un total faux, et un total faux sur un bon de commande se
--    paie en vrai. BIGINT monte a 9,2 x 10^18 pour un plafond metier de 10^11.
--
-- 2. Les lignes de document portent des COPIES (snapshots) du nom, de la
--    reference, du fournisseur et du prix. Un document signe doit rester
--    lisible et exact meme si le produit est archive ou son prix renegocie
--    dix fois ensuite.
--
-- Deux ecarts avec la version SQLite :
--
-- a. L'ordre de creation suit les cles etrangeres : MySQL les verifie a la
--    creation, SQLite non. import_catalogue precede donc tarif.
-- b. La table virtuelle FTS5 devient une table ORDINAIRE portant les formes
--    normalisees. MySQL n'a pas d'equivalent de unicode61 remove_diacritics,
--    et innodb_ft_min_token_size est une variable serveur inaccessible sur
--    mutualise. La recherche se fera en LIKE sur ces colonnes : a 3 099
--    tarifs, la difference ne se mesure pas.
--
-- Collation : utf8mb4_unicode_ci, insensible a la casse ET aux accents,
-- disponible aussi bien sur MariaDB 10.4 que sur MySQL 8. utf8mb4_0900_ai_ci
-- est ecartee : elle n'existe pas sur MariaDB.

-- ---------------------------------------------------------------- catalogue

create table if not exists produit (
  id                       bigint unsigned not null auto_increment,
  source_produit_id        bigint          not null,
  nom                      varchar(300)    not null,
  nom_normalise            varchar(300)    not null,
  code_produit_a           varchar(100)             default null,
  code_produit_n           varchar(100)             default null,
  famille                  varchar(200)             default null,
  unite                    varchar(30)              default null,
  a_photo                  tinyint(1)      not null default 0,
  actif                    tinyint(1)      not null default 1,
  derniere_synchronisation varchar(32)              default null,
  cree_le                  varchar(32)     not null,
  modifie_le               varchar(32)     not null,
  primary key (id),
  unique key uq_produit_source (source_produit_id),
  key idx_produit_nom_normalise (nom_normalise),
  key idx_produit_actif (actif)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

create table if not exists tiers (
  id              bigint unsigned not null auto_increment,
  source_tiers_id bigint          not null,
  code            varchar(100)             default null,
  nom             varchar(200)             default null,
  qualite         varchar(20)     not null default 'inconnue',
  actif           tinyint(1)      not null default 1,
  cree_le         varchar(32)     not null,
  modifie_le      varchar(32)     not null,
  primary key (id),
  unique key uq_tiers_source (source_tiers_id),
  key idx_tiers_code (code)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ imports

create table if not exists import_catalogue (
  id                        bigint unsigned not null auto_increment,
  nom_fichier               varchar(255)    not null,
  date_import               varchar(32)     not null,
  utilisateur               varchar(100)             default null,
  statut                    varchar(20)     not null,
  nombre_lignes_analysees   int             not null default 0,
  nombre_produits_nouveaux  int             not null default 0,
  nombre_produits_maj       int             not null default 0,
  nombre_produits_inchanges int             not null default 0,
  nombre_produits_archives  int             not null default 0,
  nombre_lignes_ignorees    int             not null default 0,
  nombre_erreurs            int             not null default 0,
  rapport_json              longtext        not null,
  cree_le                   varchar(32)     not null,
  primary key (id)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- Un tarif = un prix negocie entre un tiers et un produit. C'est l'unite que
-- l'utilisateur ajoute a un document : on n'achete pas "du ciment", on achete
-- "du ciment chez tel fournisseur a tel prix".
create table if not exists tarif (
  id                     bigint unsigned not null auto_increment,
  source_ligne_id        bigint          not null,
  produit_id             bigint unsigned          default null,
  tiers_id               bigint unsigned          default null,
  designation_libre      varchar(300)             default null,
  designation_normalisee varchar(300)             default null,
  code_chez_tiers        varchar(100)             default null,
  prix_centimes          bigint                   default null,
  prix_lu_centimes       bigint                   default null,
  echelle                varchar(20)     not null default 'ariary_certain',
  echelle_corrigee       tinyint(1)      not null default 0,
  echelle_incertaine     tinyint(1)      not null default 0,
  date_tarif             varchar(10)              default null,
  actif                  tinyint(1)      not null default 1,
  societe                varchar(100)             default null,
  import_id              bigint unsigned          default null,
  cree_le                varchar(32)     not null,
  modifie_le             varchar(32)     not null,
  primary key (id),
  unique key uq_tarif_source (source_ligne_id),
  key idx_tarif_produit (produit_id),
  key idx_tarif_tiers (tiers_id),
  key idx_tarif_prix (prix_centimes),
  constraint fk_tarif_produit foreign key (produit_id) references produit (id) on delete set null,
  constraint fk_tarif_tiers   foreign key (tiers_id)   references tiers (id)   on delete set null,
  constraint fk_tarif_import  foreign key (import_id)  references import_catalogue (id) on delete set null
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- Index de recherche. Remplace la table virtuelle FTS5 de la version SQLite.
-- Les colonnes portent les formes NORMALISEES (minuscules, sans accent, sans
-- ponctuation) produites par Texte::normaliserPourRecherche : c'est ce qui
-- rend "comprimes" capable de trouver "comprimes" accentue, et "coeur" de
-- trouver la ligature.
create table if not exists tarif_recherche (
  tarif_id               bigint unsigned not null,
  libelle_normalise      varchar(600)    not null default '',
  code_normalise         varchar(300)    not null default '',
  fournisseur_normalise  varchar(200)    not null default '',
  primary key (tarif_id),
  key idx_recherche_libelle (libelle_normalise(191)),
  constraint fk_recherche_tarif foreign key (tarif_id) references tarif (id) on delete cascade
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- documents

create table if not exists document (
  id             bigint unsigned not null auto_increment,
  numero         varchar(30)     not null,
  type           varchar(20)     not null,
  date_document  varchar(10)     not null,
  statut         varchar(20)     not null default 'brouillon',
  tiers_libelle  varchar(200)             default null,
  notes          text                     default null,
  devise         varchar(10)     not null default 'MGA',
  total_centimes bigint          not null default 0,
  cree_par       varchar(100)             default null,
  cree_le        varchar(32)     not null,
  modifie_le     varchar(32)     not null,
  primary key (id),
  unique key uq_document_numero (numero),
  key idx_document_statut (statut),
  key idx_document_date (date_document)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

create table if not exists ligne_document (
  id                               bigint unsigned not null auto_increment,
  document_id                      bigint unsigned not null,
  numero_ligne                     int             not null,
  -- Les references restent nullables : un produit archive ne doit jamais
  -- empecher de relire un ancien document.
  produit_id                       bigint unsigned          default null,
  tarif_id                         bigint unsigned          default null,
  nom_produit_snapshot             varchar(300)    not null,
  reference_snapshot               varchar(100)             default null,
  fournisseur_snapshot             varchar(100)             default null,
  unite_snapshot                   varchar(30)              default null,
  prix_catalogue_snapshot_centimes bigint                   default null,
  prix_unitaire_centimes           bigint          not null,
  prix_modifie_manuellement        tinyint(1)      not null default 0,
  quantite_milliemes               bigint          not null,
  sous_total_centimes              bigint          not null,
  cree_le                          varchar(32)     not null,
  primary key (id),
  key idx_ligne_document (document_id),
  constraint fk_ligne_document foreign key (document_id) references document (id) on delete cascade,
  constraint fk_ligne_produit  foreign key (produit_id)  references produit (id)  on delete set null,
  constraint fk_ligne_tarif    foreign key (tarif_id)    references tarif (id)    on delete set null
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

create table if not exists historique_produit (
  id                bigint unsigned not null auto_increment,
  produit_id        bigint unsigned          default null,
  import_id         bigint unsigned          default null,
  type_modification varchar(50)     not null,
  champ_modifie     varchar(100)             default null,
  ancienne_valeur   text                     default null,
  nouvelle_valeur   text                     default null,
  utilisateur       varchar(100)             default null,
  date_modification varchar(32)     not null,
  primary key (id),
  key idx_historique_produit (produit_id),
  constraint fk_historique_produit foreign key (produit_id) references produit (id) on delete cascade,
  constraint fk_historique_import  foreign key (import_id)  references import_catalogue (id) on delete set null
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;

-- Compteur des numeros de document, par type et par annee.
create table if not exists compteur_document (
  type   varchar(20) not null,
  annee  int         not null,
  valeur int         not null default 0,
  primary key (type, annee)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_unicode_ci;
