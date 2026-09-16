import type { Tarif } from './extraction.js';
import { CENTIMES_PAR_ARIARY } from '../domaine/monnaie.js';

/**
 * Regroupement des tarifs en "lots de saisie".
 *
 * L'analyse du fichier KA a montre que l'echelle (ariary ou milliers
 * d'ariary) ne depend ni du produit ni du fournisseur, mais du moment ou la
 * ligne a ete saisie : des blocs entiers d'identifiants consecutifs, chez un
 * meme tiers, ont ete tapes dans la meme unite.
 *
 * Regrouper ainsi permet d'arbitrer par lot plutot que ligne a ligne. Les
 * lots ne sont toutefois PAS homogenes a coup sur : certains melangent les
 * deux echelles. Ils servent a presenter le travail dans un ordre utile, pas
 * a decider a la place de l'utilisateur.
 */

/** Au-dela de cet ecart d'identifiants, on considere une autre session de saisie. */
export const ECART_ID_NOUVEAU_LOT = 2000;

export type LotSaisie = {
  id: string;
  sourceTiersId: number | null;
  premierLigneId: number;
  dernierLigneId: number;
  tarifs: Tarif[];
  /** Mediane en ariary, indice le plus robuste de l'echelle du lot. */
  medianeAriary: number;
  minAriary: number;
  maxAriary: number;
  nombreIncertains: number;
  nombreCorriges: number;
  /** Vrai si le lot contient au moins une ligne que l'automatisme n'a pas su trancher. */
  demandeArbitrage: boolean;
  /** Vrai si le lot melange visiblement les deux echelles : a regarder de pres. */
  echellesMelangees: boolean;
};

function mediane(valeurs: readonly number[]): number {
  if (valeurs.length === 0) return 0;
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  if (triees.length % 2 === 1) return triees[milieu] ?? 0;
  return ((triees[milieu - 1] ?? 0) + (triees[milieu] ?? 0)) / 2;
}

export function construireLots(tarifs: readonly Tarif[]): LotSaisie[] {
  const avecPrix = tarifs
    .filter((tarif) => tarif.prixLuCentimes !== null && tarif.prixLuCentimes > 0)
    .sort((a, b) => a.sourceLigneId - b.sourceLigneId);

  const lots: LotSaisie[] = [];
  let courant: LotSaisie | null = null;

  for (const tarif of avecPrix) {
    const memeTiers = courant?.sourceTiersId === tarif.sourceTiersId;
    const proche =
      courant !== null && tarif.sourceLigneId - courant.dernierLigneId <= ECART_ID_NOUVEAU_LOT;

    if (!courant || !memeTiers || !proche) {
      courant = {
        id: `lot-${lots.length + 1}`,
        sourceTiersId: tarif.sourceTiersId,
        premierLigneId: tarif.sourceLigneId,
        dernierLigneId: tarif.sourceLigneId,
        tarifs: [],
        medianeAriary: 0,
        minAriary: 0,
        maxAriary: 0,
        nombreIncertains: 0,
        nombreCorriges: 0,
        demandeArbitrage: false,
        echellesMelangees: false,
      };
      lots.push(courant);
    }

    courant.dernierLigneId = tarif.sourceLigneId;
    courant.tarifs.push(tarif);
  }

  for (const lot of lots) {
    // On raisonne sur la valeur LUE, pas sur la valeur corrigee : c'est
    // l'unite de saisie d'origine que l'on cherche a reconnaitre.
    const ariary = lot.tarifs.map((tarif) => (tarif.prixLuCentimes ?? 0) / CENTIMES_PAR_ARIARY);
    lot.medianeAriary = mediane(ariary);
    lot.minAriary = Math.min(...ariary);
    lot.maxAriary = Math.max(...ariary);
    lot.nombreIncertains = lot.tarifs.filter((tarif) => tarif.echelleIncertaine).length;
    lot.nombreCorriges = lot.tarifs.filter((tarif) => tarif.echelleCorrigee).length;
    lot.demandeArbitrage = lot.nombreIncertains > 0;
    lot.echellesMelangees =
      lot.tarifs.some((tarif) => tarif.echelle === 'milliers_certain') &&
      lot.tarifs.some((tarif) => tarif.echelle === 'ariary_certain');
  }

  return lots;
}

export type SyntheseLots = {
  nombreLots: number;
  lotsHomogenes: number;
  lotsMelanges: number;
  lotsADemanderArbitrage: number;
  lignesAArbitrer: number;
};

export function synthetiserLots(lots: readonly LotSaisie[]): SyntheseLots {
  return {
    nombreLots: lots.length,
    lotsHomogenes: lots.filter((lot) => !lot.echellesMelangees).length,
    lotsMelanges: lots.filter((lot) => lot.echellesMelangees).length,
    lotsADemanderArbitrage: lots.filter((lot) => lot.demandeArbitrage).length,
    lignesAArbitrer: lots.reduce((somme, lot) => somme + lot.nombreIncertains, 0),
  };
}
