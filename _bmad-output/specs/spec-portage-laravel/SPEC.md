---
id: SPEC-portage-laravel
companions:
  - brownfield.md
  - stack.md
  - conventions.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Portage de Verif Achats vers PHP/Laravel et publication sur achats.karoka.net

## Why

**Une opportunité à saisir, sous contrainte d'infrastructure.** Verif Achats est aujourd'hui utilisable mais enfermée : elle tourne sur un poste Windows du bureau principal et n'est joignable que par le réseau local. Du personnel travaille dans un **second lieu physique**, relié par une connexion Internet indépendante, où l'utilisateur n'administre **ni le routeur ni les postes**. Toute solution demandant une installation poste par poste — VPN maillé compris — y devient une charge de support permanente.

Le seul serveur dont dispose l'entreprise est un hébergement mutualisé Plesk qui exécute **PHP et MySQL, mais pas Node.js**. L'application ne peut donc pas être publiée telle quelle. La porter en PHP/Laravel est le seul chemin vers une adresse unique, joignable des deux lieux, sans rien installer sur les postes.

La bascule a un prix, assumé : le bureau principal, qui fonctionne aujourd'hui même Internet coupé, en deviendra dépendant.

## Capabilities

- **CAP-1** — Saisie d'un bon de commande au clavier
  - **intent:** L'utilisateur recherche un produit, l'ajoute au meilleur prix et construit un bon sans quitter le clavier.
  - **success:** Les raccourcis actuels (`/`, `↑` `↓`, `Entrée`, `→` `←`, `Échap`) produisent le même résultat qu'en TypeScript ; un article déjà présent incrémente sa ligne au lieu d'en créer une seconde.

- **CAP-2** — Enregistrement et finalisation d'un bon
  - **intent:** Le serveur établit les montants qui font foi et fige un document finalisé.
  - **success:** Un test rejoue un total falsifié envoyé par le client et vérifie qu'il est sans effet ; un test vérifie qu'un document finalisé refuse toute modification.

- **CAP-3** — Consultation du catalogue
  - **intent:** L'utilisateur parcourt les 869 produits, filtre par famille et déplie les tarifs.
  - **success:** Les 59 produits qui n'existent que par un tarif archivé restent visibles, relégués et signalés par un badge.

- **CAP-4** — Historique des bons
  - **intent:** L'utilisateur retrouve un bon ancien par numéro, fournisseur, note, ou par un produit qu'il contient.
  - **success:** Une recherche portant sur un produit ramène les bons qui le contiennent.

- **CAP-5** — Import du catalogue depuis un export Verif K7
  - **intent:** Un export JSON alimente le catalogue, encodage réparé et échelles de saisie traitées.
  - **success:** Le test différentiel sur l'export réel ne montre aucune divergence avec l'implémentation TypeScript.

- **CAP-6** — Authentification
  - **intent:** Seules les personnes autorisées accèdent à l'application.
  - **success:** Toute route atteinte sans session renvoie vers la page de connexion.

- **CAP-7** — Tableau de bord
  - **intent:** L'utilisateur voit d'un coup d'œil les compteurs, l'alerte sur les prix à vérifier et les bons récents.
  - **success:** Les compteurs correspondent aux valeurs lues directement en base.

- **CAP-8** — Publication sur le sous-domaine
  - **intent:** L'application est servie en HTTPS sur `achats.karoka.net` depuis l'hébergement Plesk existant.
  - **success:** Un poste du second lieu ouvre l'adresse, se connecte et enregistre un bon.

## Constraints

- **Aucun processus permanent.** L'hébergement est mutualisé : ni worker de file, ni démon. Driver de file `sync`, tâches planifiées par le cron de Plesk.
- **Racine du document obligatoirement sur `public/`.** Sinon `.env` — mot de passe MySQL et clé d'application — devient téléchargeable.
- **Les montants ne transitent jamais en flottant.** Entiers de centimes d'ariary du parseur jusqu'à l'affichage, sur les deux couches. Voir `conventions.md`.
- **Aucune dépendance à l'extension `intl`.** Elle n'est pas garantie sur l'hébergement, et son comportement varie selon la version d'ICU.
- **Le code du domaine reste compatible PHP 8.0.** Le poste de développement est en 8.0, le serveur en 8.2 : cette compatibilité est ce qui permet de tester localement.
- **L'interface React n'est pas réécrite.** Laravel sert l'API sur les mêmes URL `/api/*`.
- **Pas de publication sans authentification.** CAP-6 précède CAP-8.

## Non-goals

- **Aucune nouvelle fonctionnalité.** Le portage vise l'équivalence, pas l'enrichissement. L'écran d'arbitrage des 209 prix, l'export PDF/CSV et la synchronisation différentielle restent hors périmètre.
- **Aucune migration de données métier.** La base ne contient aucun bon de commande ; le catalogue se réimporte depuis l'export JSON.
- **Le poste Windows n'est pas maintenu en parallèle** comme seconde source de vérité.
- **Aucune refonte de l'interface.** Ni changement visuel, ni changement de comportement clavier.
- **Pas de gestion fine des droits.** Une authentification unique suffit ; les rôles et permissions ne sont pas au programme.

## Success signal

Une personne du second lieu ouvre `https://achats.karoka.net`, se connecte, cherche « comprimes », ajoute le produit à un bon, l'enregistre et le finalise — sans que rien n'ait été installé sur son poste, et avec des montants identiques au centime près à ceux qu'aurait produits l'application TypeScript.

## Assumptions

- Laravel 12 est visé, sous réserve que le sous-domaine expose bien PHP 8.2 comme le domaine principal.
- Le sous-domaine s'appellera `achats.karoka.net` ; le nom n'est pas encore validé.
- L'hébergement dispose de l'espace disque nécessaire (2 390 Mo déjà consommés, quota inconnu).

## Open Questions

- Combien de personnes au second lieu, et saisissent-elles des bons ou consultent-elles seulement ? La réponse dimensionne CAP-6.
- Un compte par personne, ou comptes partagés ?
- Faut-il corriger le bug de la ligature `œ` dans l'application TypeScript actuelle ? Cela impose une reconstruction de l'index FTS sur une base en service. Indépendant du portage.
- Le diagnostic n'a pas encore été exécuté sur berder : version PHP et extensions du sous-domaine non confirmées.
- Le poste Windows reste-t-il en service après la bascule, ou est-il arrêté ?
