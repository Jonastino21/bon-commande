import type { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/**
 * `node:sqlite` est charge par require() plutot que par import.
 *
 * Vite (donc Vitest) ne reconnait pas encore ce module dans sa liste de
 * modules natifs de Node et tente de le resoudre sur le disque, ce qui fait
 * echouer les tests. Le require dynamique echappe a cette analyse statique.
 * L'import de type au-dessus est efface a la compilation : le typage reste
 * complet.
 */
const requireNode = createRequire(import.meta.url);
const { DatabaseSync: SQLite } = requireNode('node:sqlite') as typeof import('node:sqlite');

/**
 * Ouverture de la base.
 *
 * On utilise `node:sqlite`, integre a Node 24, plutot qu'un module natif :
 * aucune compilation a l'installation, donc rien a construire sur les postes
 * Windows qui feront tourner l'application. Le SQLite embarque fournit FTS5
 * et le tokenizer unicode61, qui sont exactement ce dont la recherche a
 * besoin.
 */

const ICI = dirname(fileURLToPath(import.meta.url));

export type Bdd = DatabaseSync;

export function ouvrirBdd(chemin: string): Bdd {
  if (chemin !== ':memory:') {
    mkdirSync(dirname(resolve(chemin)), { recursive: true });
  }

  const bdd = new SQLite(chemin);

  // WAL : plusieurs postes peuvent lire pendant qu'un autre ecrit.
  // foreign_keys : SQLite ne les applique pas par defaut, il faut le demander.
  bdd.exec('pragma journal_mode = wal');
  bdd.exec('pragma foreign_keys = on');
  bdd.exec('pragma busy_timeout = 5000');

  return bdd;
}

export function appliquerSchema(bdd: Bdd): void {
  const schema = readFileSync(join(ICI, 'schema.sql'), 'utf8');
  bdd.exec(schema);
}

export function creerBdd(chemin: string): Bdd {
  const bdd = ouvrirBdd(chemin);
  appliquerSchema(bdd);
  return bdd;
}

/**
 * Execute `action` dans une transaction.
 *
 * Indispensable pour l'import : un catalogue a moitie mis a jour serait pire
 * que pas de mise a jour du tout. Soit tout passe, soit rien.
 */
export function enTransaction<T>(bdd: Bdd, action: () => T): T {
  bdd.exec('begin immediate');
  try {
    const resultat = action();
    bdd.exec('commit');
    return resultat;
  } catch (erreur) {
    bdd.exec('rollback');
    throw erreur;
  }
}

/** SQLite ne connait pas les booleens : on stocke 0 ou 1. */
export function versEntier(valeur: boolean): number {
  return valeur ? 1 : 0;
}

export function versBooleen(valeur: unknown): boolean {
  return Number(valeur) === 1;
}

export function maintenant(): string {
  return new Date().toISOString();
}
