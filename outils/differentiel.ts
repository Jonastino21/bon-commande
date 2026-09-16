/**
 * Cote TypeScript du test differentiel : fait tourner les modules du domaine
 * sur la totalite de l'export reel et ecrit un rapport ligne par ligne.
 * Le script PHP produit exactement le meme format, et toute divergence entre
 * les deux implementations ressort alors en diff.
 *
 * Fichier de travail temporaire, a supprimer une fois le portage valide.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseMontant } from '../src/domaine/monnaie.js';
import { nettoyerLibelle, normaliserPourRecherche } from '../src/domaine/texte.js';

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

const chemin = process.argv[2]!;
const sortie = process.argv[3]!;
const donnees = JSON.parse(readFileSync(chemin, 'utf8'));
const lignes: Record<string, unknown>[] = donnees.rows;

const rapport: string[] = [];

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
    const recherche = normaliserPourRecherche(r.valeur);
    rapport.push(
      `${index}\tT\t${champ}\t${r.valeur}\t${r.mojibakeRepare ? 1 : 0}` +
        `\t${r.perteEncodage ? 1 : 0}\t${r.espacesNormalises ? 1 : 0}\t${recherche}`,
    );
  }
}

writeFileSync(sortie, rapport.join('\n') + '\n', 'utf8');
console.log(`TypeScript : ${rapport.length} lignes de rapport`);
