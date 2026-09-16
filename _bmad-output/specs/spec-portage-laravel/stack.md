# Pile cible et hébergement

## L'hébergement, tel qu'il est

| | |
|---|---|
| Panneau | Plesk, `berder.ksyni.net:8443` — compte **client**, pas administrateur |
| Serveur | `91.121.47.227` (OVH), partagé avec le site principal |
| Domaine | `karoka.net`, DNS chez **Gandi** |
| PHP | 8.2.33 sur le domaine principal |
| Disponible | MySQL, Composer, Git, Terminal SSH, Let's Encrypt, répertoires protégés |
| **Absent** | **Node.js** — l'extension Plesk n'est pas installée et ne peut pas l'être depuis un compte client |
| Occupation | 2 390 Mo consommés, quota inconnu |

Le compte étant client et non administrateur, toute extension manquante passe
par une demande à l'hébergeur.

## Pile retenue

- **Laravel 12** si PHP ≥ 8.2 est confirmé sur le sous-domaine, Laravel 10 sinon.
- **MySQL** via Eloquent. `$casts` à `integer` sur toute colonne de montant :
  PDO renvoie les entiers en chaînes par défaut.
- **Laravel Breeze** pour l'authentification (CAP-6).
- **React + Vite inchangé**, compilé dans `public/`.
- **PHPUnit** — les tests du domaine sont déjà écrits dans ce format.

## Disposition sur le serveur

```
achats.karoka.net/
  public/          ← RACINE DU DOCUMENT, contient index.php et l'interface compilée
  app/Domaine/     ← le socle métier porté
  .env             ← hors racine web, non téléchargeable
```

Le `/public` dans le champ « Racine du document » de Plesk n'est pas cosmétique :
sans lui, `.env` est servi en clair.

## Ce que le mutualisé interdit

- Pas de worker de file : driver `sync`.
- Pas de démon : les tâches planifiées passent par le cron de Plesk.
- `innodb_ft_min_token_size` est une variable serveur : l'index FULLTEXT de
  MySQL ignorerait les mots de moins de trois lettres sans recours. D'où le
  choix du `LIKE` sur collation insensible aux accents — à 3 099 tarifs, la
  différence de performance n'est pas mesurable.

## Vérification avant de construire

`php/public/diagnostic.php` fait tourner le vrai code du domaine sur le serveur
et contrôle version, extensions, racine du document, HTTPS et limites PHP.
**À exécuter et à supprimer avant d'écrire la suite.**

Non encore exécuté : la version PHP et les extensions du sous-domaine ne sont
pas confirmées.
