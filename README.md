# Verif Achats

Application interne de création de bons de commande à partir du catalogue
Verif K7.

**État : phases 1 et 2 terminées.** L'application est utilisable.

## Utiliser l'application

```bash
npm install
npm run initialiser -- "data/verifk7_module21_view54_KA_2026-09-16-04-23-13.json"
npm run demarrer
```

Puis ouvrir **http://localhost:4173**. Les autres postes du réseau y accèdent
par l'adresse IP du poste serveur, sur le même port.

| Commande | Rôle |
|---|---|
| `npm run initialiser -- <fichier.json>` | Construit la base à partir d'un export. `--remplacer` écrase le catalogue (les documents ne sont jamais touchés). |
| `npm run demarrer` | Compile l'interface et lance le serveur. |
| `npm run serveur` | Lance le serveur sans recompiler. |
| `npm run importer -- <fichier.json>` | Analyse un export et produit un rapport, sans rien écrire en base. |
| `npm test` | 111 tests. |

## Les écrans

**Tableau de bord** — compteurs, alerte sur les prix à vérifier, bons récents.

**Nouveau bon de commande** — l'écran central. Il se pilote entièrement au
clavier :

| Touche | Effet |
|---|---|
| `/` | Revenir dans la recherche depuis n'importe où |
| `↑` `↓` | Parcourir les suggestions |
| `Entrée` | Ajouter au meilleur prix |
| `→` `←` | Déplier / replier les fournisseurs d'un produit |
| `Échap` | Refermer |

Un article déjà présent incrémente sa ligne au lieu d'en créer une seconde.
Le total général reste affiché en permanence en bas de l'écran.

**Le fournisseur de l'en-tête se remplit tout seul** à partir de la première
ligne ajoutée, avec un badge qui dit d'où vient la valeur. Une saisie manuelle
n'est jamais écrasée. Si le bon finit par mélanger plusieurs fournisseurs,
l'écran le signale et met les lignes concernées en évidence — sans bloquer :
préparer un brouillon avant de le scinder est un usage légitime, mais envoyer
sans s'en apercevoir un bon comportant des lignes qui ne concernent pas le
destinataire revient en litige.

**Catalogue** — 869 produits, filtrage par famille, tarifs dépliables par produit.

**Historique** — recherche par numéro, fournisseur, note, **ou par un produit
contenu dans le document** : c'est la façon dont on retrouve réellement un
ancien bon.

**Un seul type de document.** L'application ne produit que des bons de
commande, numérotés `BON-2026-0001`, avec un compteur qui repart à 1 chaque
année. Le champ `type` existe toujours en base et le compteur est segmenté par
type : ajouter un devis plus tard ne demandera aucune migration.

## Décisions structurantes

**Les montants ne sont jamais des flottants.** Tout est en entiers de centimes
d'ariary, du parseur jusqu'à l'affichage. `parseFloat("0.29") * 100` vaut
`28.999999999999996` : tronqué, cela fait **28 centimes au lieu de 29**. De
même `"1.15"` donne 114, `"4.35"` donne 434, `"8.20"` donne 819.

Le piège est d'autant plus sournois que la plupart des valeurs passent très
bien — `"28166.67" * 100` vaut exactement `2816667`. Tester au hasard donne
donc l'impression que la précaution est inutile, jusqu'au jour où une ligne
part avec un centime en moins. Le module `monnaie.ts` découpe la chaîne
plutôt que de multiplier un flottant. Le navigateur et le serveur utilisent **le même
module**, importé par alias plutôt que recopié — deux implémentations des
montants finiraient par diverger sans que personne ne le voie.

**Le serveur ne croit jamais le navigateur sur les montants.** L'écran affiche
un total pour informer ; le total qui fait foi est recalculé à
l'enregistrement. Un test vérifie qu'un total soufflé par le client est sans
effet.

**Les lignes de document portent des copies.** Nom, référence, fournisseur et
prix sont figés à l'ajout. Un test vérifie qu'un document reste exact après
suppression complète du catalogue.

**Un document finalisé est figé.** Pour le corriger, on l'annule et on en crée
un autre. C'est la contrepartie de sa valeur de preuve.

**L'échelle de saisie est mixte.** Une partie du fichier a été saisie en
milliers d'ariary (`8.50` = 8 500 Ar) :

| Zone | Volume | Traitement |
|---|---|---|
| < 100 Ar | 306 lignes | Corrigé ×1000 automatiquement |
| 100 – 3 000 Ar | 209 lignes | **Arbitrage humain requis** |
| ≥ 3 000 Ar | 1 745 lignes | Inchangé |

Les 209 lignes non tranchées portent un badge **prix à vérifier** partout dans
l'application. Elles sont regroupées en lots de saisie dans
`sortie/echelles-a-arbitrer.json` — l'écran d'arbitrage reste à faire.

**Les tarifs archivés sont montrés, pas masqués.** 860 tarifs portent l'état
`NA` dans Verif K7. Les filtrer faisait disparaître 59 produits de la
recherche : l'utilisateur en aurait conclu que l'application ne les connaît
pas, alors qu'elle en a le prix. Ils sont relégués après les tarifs courants,
signalés par un badge, et jamais proposés par défaut.

**L'encodage est réparé séquence par séquence.** Le portail a relu de l'UTF-8
comme du Windows-1252 (pas du Latin-1 : dans la plage 0x80-0x9F les deux
divergent). Certaines chaînes ne sont abîmées qu'en partie — `décharge agréée
… COÂ²` — où décoder la chaîne entière détruirait les accents déjà corrects.

**Clé d'identification.** `assoc__produit__id` pour les produits, `id` de ligne
pour les tarifs. Le code produit (`C.Prod A`) est écarté : 7 codes sont portés
par plusieurs produits et seuls 98 produits sur 869 en possèdent un.

## Architecture

```
src/domaine/     monnaie, texte, dates — règles métier pures
src/import/      schema, extraction, lots, rapport
src/bdd/         schéma SQL, ingestion, recherche, documents
src/serveur/     API Fastify + service de l'interface
src/cli/         importer, initialiser
web/             React + Vite + Tailwind
tests/           111 tests
```

La base est **SQLite via `node:sqlite`**, intégré à Node 24 : aucune
compilation native à installer sur les postes Windows. La recherche utilise
**FTS5** avec le tokenizer `unicode61 remove_diacritics 2`, ce qui rend
« comprimes » capable de trouver « comprimés » sans traitement supplémentaire.
Réponse mesurée entre 0,3 et 2,3 ms sur les 3 099 tarifs.

Sauvegarde : la base entière est **un seul fichier** (`data/verif.db`). Une
copie est faite automatiquement avant tout import avec `--remplacer`.

## Reste à faire

- **Phase 3** : export PDF et CSV (l'impression navigateur fonctionne déjà).
- **Phase 4** : synchronisation différentielle — comparaison avec le catalogue
  existant, rapport avant/après, validation administrateur, archivage,
  historique des imports.
- **Écran d'arbitrage** des 209 prix à trancher.
- **Noms des fournisseurs** : le module 21 ne transporte que des codes
  (`FIBASO4001`). L'export du module Tiers les apporterait.
- **Unités** : absentes du module 21, à saisir ou à importer du module Produits.
