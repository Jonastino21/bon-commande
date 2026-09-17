# Verif K7 - Export de données

Extension Chrome (Manifest V3) pour extraire en JSON ou CSV les données des
tableaux du portail interne `verifk7.krkfr.net`, à usage exclusivement interne
et autorisé par l'entreprise.

## Comment ça marche

Le tableau du portail (composant jQuery EasyUI "datagrid") charge ses lignes
via des appels à une API interne : `POST /miniclick/json` avec les paramètres
`viewId`, `moduleId`, `page` et `rows`.

Cette extension :
1. Lit directement, dans la page, la configuration du tableau actuellement
   affiché (URL de l'API, `viewId`, `moduleId`, liste des colonnes).
2. Rappelle cette même API avec la session déjà ouverte dans votre navigateur
   (aucun identifiant n'est demandé ni stocké), en parcourant les pages
   (100 lignes par appel, comme le fait l'application elle-même).
3. Applique le filtre **société** choisi (KA par défaut) **côté serveur**,
   avec le paramètre `filterRules` — exactement le même mécanisme que la case
   de filtre de la grille (colonne "MSO"). L'extension ne récupère donc QUE
   les pages de la société demandée, pas tout le module.
4. Respecte aussi le filtre / la vue actuellement sélectionnée dans
   l'application (ex. "Actif - non") puisqu'elle utilise le même `viewId`.
5. Assemble le résultat et déclenche un téléchargement JSON ou CSV.

Comme elle réutilise l'API existante de l'application au lieu de lire le
tableau affiché à l'écran, elle fonctionne sur **n'importe quel module** du
portail qui utilise ce même composant de tableau, pas uniquement "tarifs
tiers".

### Résilience face aux erreurs serveur

En testant sur le module "tarifs tiers", j'ai constaté que le serveur renvoie
une erreur (HTTP 500) sur certaines pages — pas de façon aléatoire, mais à
cause d'un enregistrement précis dont le contenu fait planter le serveur au
moment de la réponse (probablement une donnée corrompue ou mal formée côté
application — cela vaut la peine de le signaler au développeur de l'outil).
Quand ça arrive, l'extension subdivise automatiquement la page concernée
(100 → 10 → 1 ligne) pour isoler et sauter uniquement la ou les ligne(s)
fautive(s), au lieu de perdre toute la page ou toute l'extraction. Les
enregistrements qui n'ont vraiment pas pu être récupérés sont listés à la fin
(dans le message et dans la clé `skippedRecords` du JSON exporté).

## Installation (mode développeur)

1. Décompressez ce dossier quelque part sur votre ordinateur.
2. Dans Chrome, allez sur `chrome://extensions`.
3. Activez le **Mode développeur** (interrupteur en haut à droite).
4. Cliquez sur **Charger l'extension non empaquetée** (*Load unpacked*).
5. Sélectionnez ce dossier (`verifk7-exporter`).
6. Ouvrez ou rechargez une page du portail (`https://verifk7.krkfr.net/...`)
   contenant un tableau : un petit panneau avec deux boutons
   (**📦 Exporter (JSON)** / **CSV**) apparaît en bas à droite de la page.

## Utilisation

- Ouvrez la page du module et de la vue que vous voulez exporter (le filtre
  actif dans l'application est respecté).
- Choisissez la **société** à exporter dans la liste déroulante du panneau
  (**KA** est sélectionné par défaut — les autres codes disponibles sont NE,
  PA, SA, SE, SO, TT, ou "Toutes" pour ne rien filtrer). Ce filtre est envoyé
  au serveur : seules les pages correspondantes sont récupérées, pas tout le
  module.
- Cliquez sur **📦 Exporter (JSON)** ou **CSV**.
- Le bouton affiche la progression (`Extraction… page X/Y`, Y étant connu dès
  la première page grâce au total renvoyé par le serveur) pendant l'extraction,
  puis le fichier se télécharge automatiquement dans votre dossier
  Téléchargements, nommé par exemple :
  `verifk7_module21_view54_KA_2026-09-16-08-30-00.json`
- Sur "tarifs tiers" filtré sur KA (≈ 3 200 lignes / 32 pages), l'extraction
  prend environ 1 à 2 minutes, essentiellement à cause des pauses volontaires
  entre requêtes et de la reprise sur les pages en erreur (voir ci-dessus).

Le JSON produit contient, en plus des lignes (`rows`), la correspondance
entre les codes de colonnes internes et leurs libellés (`fields`), ce qui
facilite la construction d'une application par-dessus ces données.

## Limites et points d'attention

- L'extension ne fonctionne que sur `verifk7.krkfr.net` (déclaré dans
  `manifest.json`, `host_permissions`).
- Elle n'utilise que la session déjà ouverte dans votre navigateur : si vous
  n'êtes pas connecté au portail, l'export échouera comme un accès normal
  sans connexion.
- Sur un très gros module, l'extraction peut prendre un peu de temps (une
  pause de 250 ms est volontairement insérée entre chaque page pour ne pas
  solliciter excessivement le serveur).
- Cette extension n'est pas publiée sur le Chrome Web Store : elle doit être
  chargée manuellement en mode développeur sur chaque poste qui l'utilise, ou
  déployée en interne (politique d'entreprise / ExtensionInstallForcelist)
  si vous voulez l'équiper sur plusieurs postes.
- À réserver à un usage interne autorisé par votre entreprise, comme vous
  l'avez indiqué — ne pas l'utiliser sur des données ou des comptes qui ne
  vous appartiennent pas.
