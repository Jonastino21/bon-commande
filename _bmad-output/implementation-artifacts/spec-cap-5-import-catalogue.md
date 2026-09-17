---
title: 'CAP-5 — Import du catalogue et socle de persistance en PHP'
type: 'feature'
created: '2026-09-16'
status: 'in-progress'
route: 'oneshot'
route_source: 'pinned'
review: 'quick'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
baseline_commit: 'a480fa0'
context:
  - '{project-root}/_bmad-output/specs/spec-portage-laravel/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-portage-laravel/conventions.md'
  - '{project-root}/_bmad-output/specs/spec-portage-laravel/stack.md'
  - '{project-root}/_bmad-output/specs/spec-portage-laravel/brownfield.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le socle métier PHP (`Monnaie`, `Texte`) est porté et prouvé, mais rien ne
sait encore lire un export Verif K7 ni l'écrire en base. Sans cette tranche,
CAP-5 est vide et aucune des capacités suivantes n'a de données sur lesquelles
travailler.

**Approach:** Porter la chaîne d'import complète — validation de l'enveloppe,
extraction des entités, regroupement en lots de saisie, ingestion MySQL — en PDO
pur sans framework, le tout compatible PHP 8.0. Le schéma SQLite devient du DDL
MySQL : montants en `BIGINT`, collation `utf8mb4` insensible aux accents, et la
table virtuelle FTS5 remplacée par une table ordinaire interrogée en `LIKE`.

</frozen-after-approval>

## Implementation Notes

Route oneshot : le périmètre est un portage à l'identique d'un code existant et
testé, avec un oracle mécanique (le différentiel sur l'export réel). La phase de
planification n'aurait rien découvert que la lecture du source ne donne déjà.

### Décisions

- **`Dates.php` ajouté au lot.** `extraction.ts` dépend de `parseDateAAMMJJ` ;
  il n'était pas listé dans l'intention mais la tranche ne compile pas sans lui.
- **Pas de Zod en PHP.** `schema.ts` valide l'enveloppe avec Zod. Le portage
  écrit la validation à la main dans `SchemaExport.php`, en conservant le
  principe : strict sur l'enveloppe, tolérant sur les colonnes.
- **FTS5 → table ordinaire.** `tarif_recherche` devient une vraie table portant
  les formes normalisées (`libelle_normalise`, `code_normalise`,
  `fournisseur_normalise`), alimentée par `Texte::normaliserPourRecherche`.
  La recherche par `LIKE` viendra dans la tranche CAP-1/CAP-4.
- **Le `rowid` disparaît.** SQLite reliait l'index à la donnée par `rowid` ;
  MySQL utilise une colonne `tarif_id` avec clé étrangère `on delete cascade`.
- **Objets valeur à propriétés publiques.** `Produit`, `Tiers`, `Tarif`,
  `Anomalie`, `LotSaisie` sont des porteurs de données, pas des objets à
  invariants. Des accesseurs n'ajouteraient que du bruit. `readonly` n'existe
  pas en PHP 8.0.
- **`aPhoto`** : la colonne `Image` de l'export est un objet portant `total`.
  Le portage lit `total > 0`, comme le TypeScript.

### Fichiers

- `php/src/Domaine/Dates.php`, `ResultatDate.php`
- `php/src/Bdd/schema.sql`, `Connexion.php`, `Ingestion.php`
- `php/src/Import/SchemaExport.php`, `Extraction.php`, `Lots.php`, et les
  objets valeur
- `php/tests/` — tests miroirs

## Verification

**Commands:**
- `cd php && ./vendor/bin/phpunit` — attendu : tous les tests au vert
- `npx tsx outils/differentiel.ts <export> ts.txt && php php/outils/differentiel.php <export> php.txt && diff ts.txt php.txt` — attendu : aucune divergence
