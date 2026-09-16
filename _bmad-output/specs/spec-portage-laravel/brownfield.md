# L'existant

L'application TypeScript est **complète et fonctionnelle**. Elle est la référence
de comportement : en cas de doute sur une règle, c'est elle qui tranche, pas ce
document.

## Ce qui existe

| Dossier | Lignes | Rôle |
|---|---|---|
| `src/domaine/` | 370 | monnaie, texte, dates, document — règles pures |
| `src/import/` | 1 024 | schéma, extraction, lots, rapport |
| `src/bdd/` | 1 196 | schéma SQL, ingestion, recherche, documents |
| `src/serveur/` | 203 | API Fastify + service de l'interface |
| `src/cli/` | 194 | importer, initialiser |
| `web/src/` | 1 482 | React + Vite + Tailwind — **conservé tel quel** |
| `tests/` | 1 300 | 111 tests Vitest |

Base SQLite (`data/verif.db`) : 869 produits, 3 099 tarifs, **0 bon de commande**.

## Ce qui est déjà porté

`php/src/Domaine/` — 597 lignes, 90 tests PHPUnit, 145 assertions, au vert :

- `Monnaie.php` + `ResultatMontant.php`
- `Texte.php` + `ResultatTexte.php`

Namespace `App\Domaine` : le dossier se déplace dans `app/` de Laravel sans retouche.

## L'outil qui valide chaque module porté

`outils/differentiel.ts` et `php/outils/differentiel.php` font tourner les deux
implémentations sur l'export réel et produisent un rapport ligne par ligne au
même format. Un `diff` de zéro ligne vaut preuve d'équivalence.

Mesure sur le socle métier : **50 752 comparaisons, 1 divergence** — et cette
divergence était un bug du TypeScript, pas du portage.

**Chaque module porté doit passer par cet outil avant d'être considéré comme
fait.** C'est le mécanisme central de la migration.

## Écarts connus du PHP par rapport au TypeScript

Trois écarts sont délibérés et améliorent le comportement :

1. **`ResultatMontant::centimes()` lève une exception** sur un montant invalide.
   PHP n'a pas l'union discriminée qui protège le TypeScript à la compilation ;
   un `?? 0` distrait transformerait un prix illisible en zéro ariary dans un
   bon de commande.
2. **Le plafond est vérifié sur la longueur du texte**, avant toute
   multiplication, pour qu'un dépassement d'entier 64 bits ne bascule pas
   silencieusement en flottant.
3. **`sousTotal` calcule en entiers** (`intdiv` + reste) au lieu de la division
   flottante du TypeScript.

## Bug connu de l'application TypeScript

`normalize('NFD')` décompose les accents mais **pas les ligatures**. « Cœur »
est indexé « c ur » : taper « coeur » ne le trouve pas, et personne n'a `œ` au
clavier. Le portage PHP corrige ce défaut par sa table d'accents explicite.

Corriger le TypeScript impose une reconstruction de l'index FTS — décision en
suspens, indépendante du portage.

## Pièges documentés dans l'existant

- **L'échelle de saisie est mixte.** 306 lignes sous 100 Ar corrigées ×1000,
  1 745 lignes au-dessus de 3 000 Ar inchangées, et **209 lignes entre les deux
  qui attendent un arbitrage humain**. Elles portent un badge « prix à vérifier »
  partout dans l'application. L'écran d'arbitrage n'existe pas et reste hors
  périmètre.
- **Les tarifs archivés sont montrés, pas masqués.** 860 tarifs à l'état `NA`.
  Les filtrer faisait disparaître 59 produits de la recherche.
- **Les lignes de document portent des copies** figées à l'ajout : nom,
  référence, fournisseur, prix. Un document reste exact après suppression
  complète du catalogue.
- **Clé d'identification** : `assoc__produit__id` pour les produits, `id` de
  ligne pour les tarifs. Le code produit est écarté — 7 codes portés par
  plusieurs produits, et seuls 98 produits sur 869 en possèdent un.
