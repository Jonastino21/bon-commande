/**
 * Cote TypeScript du test differentiel.
 *
 * Fait tourner les modules du domaine ET la chaine d'import sur la totalite de
 * l'export reel, puis ecrit un rapport ligne par ligne. Le script PHP produit
 * exactement le meme format : toute divergence entre les deux implementations
 * ressort en diff.
 *
 * Les nombres a virgule (medianes, min, max des lots) sont emis en ENTIERS de
 * centimes plutot qu'en flottants : comparer deux rendus flottants reviendrait
 * a tester le formatage de chaque langage au lieu de tester le portage. La
 * mediane est doublee pour absorber le demi-centime des effectifs pairs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseMontant } from '../src/domaine/monnaie.js';
import { nettoyerLibelle, normaliserPourRecherche } from '../src/domaine/texte.js';
import { validerFichier } from '../src/import/schema.js';
import { extraire } from '../src/import/extraction.js';
import { construireLots, synthetiserLots } from '../src/import/lots.js';

const CHAMPS_MONTANT = ['tarifProp', 'remise', 'tarifApp', 'remise2', 'ajustement', 'tarifFinale'];
const CHAMPS_TEXTE = [
  'nomCatalogue',
  'famille',
  'designActeur',
  'codeActeur',
  'assoc__produit__3107',
  'assoc__produit__3571',
  'assoc__produit__762',
  'assoc__produit__3289',
  'assoc__produit__3045',
  'assoc__produit__327',
];

/** Date fixe : parseDateAAMMJJ refuse le futur, le verdict doit etre reproductible. */
const AUJOURDHUI = new Date('2026-09-16T00:00:00.000Z');

const n = (valeur: number | null | undefined): string =>
  valeur === null || valeur === undefined ? '' : String(valeur);
const s = (valeur: string | null | undefined): string => valeur ?? '';
const b = (valeur: boolean): string => (valeur ? '1' : '0');

const chemin = process.argv[2]!;
const sortie = process.argv[3]!;
const donnees = JSON.parse(readFileSync(chemin, 'utf8'));
const lignes: Record<string, unknown>[] = donnees.rows;

const rapport: string[] = [];

// --- Domaine, champ par champ ------------------------------------------------
for (let index = 0; index < lignes.length; index += 1) {
  const ligne = lignes[index]!;

  for (const champ of CHAMPS_MONTANT) {
    const resultat = parseMontant(ligne[champ]);
    const rendu = resultat.ok
      ? `OK\t${resultat.centimes}\t${resultat.decimalesTronquees ? 1 : 0}`
      : `KO\t${resultat.raison}\t-`;
    rapport.push(`${index}\tM\t${champ}\t${rendu}`);
  }

  for (const champ of CHAMPS_TEXTE) {
    const brut = ligne[champ];
    if (brut === undefined) continue;
    const r = nettoyerLibelle(brut);
    rapport.push(
      `${index}\tT\t${champ}\t${r.valeur}\t${r.mojibakeRepare ? 1 : 0}` +
        `\t${r.perteEncodage ? 1 : 0}\t${r.espacesNormalises ? 1 : 0}\t${normaliserPourRecherche(r.valeur)}`,
    );
  }
}

// --- Validation de l'enveloppe ----------------------------------------------
const validation = validerFichier(donnees);
if (validation.ok) {
  rapport.push(`V\tOK\t${validation.avertissements.length}`);
  for (const avertissement of validation.avertissements) rapport.push(`V\tAVERT\t${avertissement}`);
} else {
  for (const probleme of validation.problemes) {
    rapport.push(`V\tKO\t${probleme.chemin}\t${probleme.message}`);
  }
}

// --- Extraction --------------------------------------------------------------
const extraction = extraire(lignes as never, AUJOURDHUI);

rapport.push(`X\tREJETEES\t${extraction.lignesRejetees}`);
rapport.push(
  `X\tTOTAUX\t${extraction.produits.length}\t${extraction.tiers.length}` +
    `\t${extraction.tarifs.length}\t${extraction.anomalies.length}`,
);

for (const p of extraction.produits) {
  rapport.push(
    `X\tPRODUIT\t${p.sourceProduitId}\t${p.nom}\t${p.nomNormalise}\t${s(p.codeProduitA)}` +
      `\t${s(p.codeProduitN)}\t${s(p.famille)}\t${b(p.aPhoto)}\t${p.nombreTarifs}`,
  );
}

for (const t of extraction.tiers) {
  rapport.push(
    `X\tTIERS\t${t.sourceTiersId}\t${s(t.code)}\t${t.qualite}\t${s(t.qualiteBrute)}\t${t.nombreTarifs}`,
  );
}

for (const t of extraction.tarifs) {
  rapport.push(
    `X\tTARIF\t${t.sourceLigneId}\t${n(t.sourceProduitId)}\t${n(t.sourceTiersId)}` +
      `\t${s(t.designationLibre)}\t${s(t.designationNormalisee)}\t${s(t.codeChezTiers)}` +
      `\t${n(t.prixCentimes)}\t${n(t.prixLuCentimes)}\t${t.echelle}\t${b(t.echelleCorrigee)}` +
      `\t${b(t.echelleIncertaine)}\t${s(t.dateTarif)}\t${s(t.etatBrut)}\t${b(t.actif)}\t${s(t.societe)}`,
  );
}

for (const a of extraction.anomalies) {
  rapport.push(`X\tANOMALIE\t${a.type}\t${n(a.ligneId)}\t${a.detail}`);
}

// --- Lots de saisie ----------------------------------------------------------
const lots = construireLots(extraction.tarifs);
for (const lot of lots) {
  rapport.push(
    `L\t${lot.id}\t${n(lot.sourceTiersId)}\t${lot.premierLigneId}\t${lot.dernierLigneId}` +
      `\t${lot.tarifs.length}\t${Math.round(lot.medianeAriary * 200)}` +
      `\t${Math.round(lot.minAriary * 100)}\t${Math.round(lot.maxAriary * 100)}` +
      `\t${lot.nombreIncertains}\t${lot.nombreCorriges}` +
      `\t${b(lot.demandeArbitrage)}\t${b(lot.echellesMelangees)}`,
  );
}

const synthese = synthetiserLots(lots);
rapport.push(
  `S\t${synthese.nombreLots}\t${synthese.lotsHomogenes}\t${synthese.lotsMelanges}` +
    `\t${synthese.lotsADemanderArbitrage}\t${synthese.lignesAArbitrer}`,
);

writeFileSync(sortie, rapport.join('\n') + '\n', 'utf8');
console.log(`TypeScript : ${rapport.length} lignes de rapport`);
