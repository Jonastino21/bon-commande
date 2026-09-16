import { resolve } from 'node:path';
import { existsSync, copyFileSync } from 'node:fs';
import { executerImport } from '../import/executer.js';
import { rendreRapportTexte } from '../import/rapport.js';
import { creerBdd } from '../bdd/connexion.js';
import { ingererImportInitial } from '../bdd/ingestion.js';

/**
 * Cree (ou remplit) la base a partir d'un export JSON.
 *
 *   npm run initialiser -- <chemin-du-json> [--bdd data/verif.db] [--remplacer]
 *
 * Avec --remplacer, le catalogue existant est efface avant l'import. Les
 * documents deja crees ne sont jamais touches : leurs lignes portent des
 * copies du nom et du prix, ils restent lisibles et exacts.
 */

function lireArguments(argv: readonly string[]) {
  const arguments_ = argv.slice(2);
  const chemin = arguments_.find((valeur) => !valeur.startsWith('--'));
  if (!chemin) return null;

  const indexBdd = arguments_.indexOf('--bdd');
  const cheminBdd = indexBdd >= 0 ? arguments_[indexBdd + 1] : undefined;

  return {
    chemin: resolve(chemin),
    cheminBdd: resolve(cheminBdd ?? 'data/verif.db'),
    remplacer: arguments_.includes('--remplacer'),
  };
}

async function principal(): Promise<number> {
  const options = lireArguments(process.argv);
  if (!options) {
    console.error(
      'Usage : npm run initialiser -- <chemin-du-fichier.json> [--bdd data/verif.db] [--remplacer]',
    );
    return 2;
  }

  console.log(`Lecture de ${options.chemin}`);
  const resultat = await executerImport(options.chemin);

  if (!resultat.ok) {
    console.error(`\nEchec de l'import (etape : ${resultat.etape})\n`);
    for (const message of resultat.messages) console.error(`  - ${message}`);
    return 1;
  }

  console.log(rendreRapportTexte(resultat.rapport));

  // Sauvegarde avant toute modification massive : la base entiere tient dans
  // un fichier, la copier coute quelques dizaines de millisecondes et evite
  // une perte irreversible si l'import se passe mal.
  if (existsSync(options.cheminBdd) && options.remplacer) {
    const sauvegarde = `${options.cheminBdd}.sauvegarde-${Date.now()}`;
    copyFileSync(options.cheminBdd, sauvegarde);
    console.log(`\nSauvegarde de la base existante : ${sauvegarde}`);
  }

  const bdd = creerBdd(options.cheminBdd);
  const ingestion = ingererImportInitial(bdd, resultat.extraction, resultat.rapport, {
    remplacer: options.remplacer,
  });
  bdd.close();

  console.log(`\nBase ecrite : ${options.cheminBdd}`);
  console.log(`  Import n° ${ingestion.importId}`);
  console.log(`  ${ingestion.produitsInseres} produits`);
  console.log(`  ${ingestion.tiersInseres} tiers`);
  console.log(`  ${ingestion.tarifsInseres} tarifs`);

  return 0;
}

principal()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((erreur: unknown) => {
    console.error('Erreur inattendue :', erreur);
    process.exitCode = 1;
  });
