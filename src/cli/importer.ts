import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { executerImport } from '../import/executer.js';
import { rendreRapportTexte } from '../import/rapport.js';
import { CENTIMES_PAR_ARIARY } from '../domaine/monnaie.js';

/**
 * Import en ligne de commande (phase 1).
 *
 *   npm run importer -- <chemin-du-json> [--sortie <dossier>]
 *
 * Produit le rapport en console et, dans le dossier de sortie, les fichiers
 * normalises qui serviront d'entree a la phase 2 (base SQLite).
 */

type Options = { chemin: string; sortie: string };

function lireArguments(argv: readonly string[]): Options | null {
  const arguments_ = argv.slice(2);
  const chemin = arguments_.find((valeur) => !valeur.startsWith('--'));
  if (!chemin) return null;

  const indexSortie = arguments_.indexOf('--sortie');
  const sortie = indexSortie >= 0 ? arguments_[indexSortie + 1] : undefined;

  return { chemin: resolve(chemin), sortie: resolve(sortie ?? 'sortie') };
}

async function principal(): Promise<number> {
  const options = lireArguments(process.argv);
  if (!options) {
    console.error(
      [
        'Usage : npm run importer -- <chemin-du-fichier.json> [--sortie <dossier>]',
        '',
        'Exemple :',
        '  npm run importer -- "C:/Users/.../verifk7_module21_view54_KA.json"',
      ].join('\n'),
    );
    return 2;
  }

  const resultat = await executerImport(options.chemin);

  if (!resultat.ok) {
    console.error(`\nEchec de l'import (etape : ${resultat.etape})\n`);
    for (const message of resultat.messages) console.error(`  - ${message}`);
    return 1;
  }

  console.log(rendreRapportTexte(resultat.rapport));

  await mkdir(options.sortie, { recursive: true });

  const lotsAArbitrer = resultat.lots
    .filter((lot) => lot.demandeArbitrage)
    .sort((a, b) => b.nombreIncertains - a.nombreIncertains)
    .map((lot) => ({
      id: lot.id,
      sourceTiersId: lot.sourceTiersId,
      plageLignes: [lot.premierLigneId, lot.dernierLigneId],
      medianeAriary: lot.medianeAriary,
      minAriary: lot.minAriary,
      maxAriary: lot.maxAriary,
      echellesMelangees: lot.echellesMelangees,
      lignes: lot.tarifs
        .filter((tarif) => tarif.echelleIncertaine)
        .map((tarif) => ({
          sourceLigneId: tarif.sourceLigneId,
          designation: tarif.designationLibre,
          sourceProduitId: tarif.sourceProduitId,
          prixLuAriary: (tarif.prixLuCentimes ?? 0) / CENTIMES_PAR_ARIARY,
        })),
    }));

  const fichiers: Array<[string, unknown]> = [
    ['rapport.json', resultat.rapport],
    ['produits.json', resultat.extraction.produits],
    ['tiers.json', resultat.extraction.tiers],
    ['tarifs.json', resultat.extraction.tarifs],
    ['anomalies.json', resultat.extraction.anomalies],
    ['echelles-a-arbitrer.json', lotsAArbitrer],
  ];

  for (const [nom, donnees] of fichiers) {
    await writeFile(join(options.sortie, nom), JSON.stringify(donnees, null, 2), 'utf8');
  }

  console.log(`\nFichiers normalises ecrits dans : ${options.sortie}`);
  for (const [nom] of fichiers) console.log(`  - ${nom}`);

  const aArbitrer = resultat.rapport.echelles.aArbitrer;
  if (aArbitrer > 0) {
    console.log(
      `\nA FAIRE : ${aArbitrer} prix attendent un arbitrage d'echelle ` +
        `(voir echelles-a-arbitrer.json, regroupes par lot de saisie).`,
    );
  }

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
