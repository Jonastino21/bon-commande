import { describe, expect, it } from 'vitest';
import { construireLots, ECART_ID_NOUVEAU_LOT, synthetiserLots } from '../src/import/lots.js';
import type { Tarif } from '../src/import/extraction.js';

function tarif(surcharge: Partial<Tarif> & Pick<Tarif, 'sourceLigneId'>): Tarif {
  return {
    sourceProduitId: null,
    sourceTiersId: 1,
    designationLibre: null,
    designationNormalisee: null,
    codeChezTiers: null,
    prixCentimes: 100_00,
    prixLuCentimes: 100_00,
    echelle: 'a_arbitrer',
    echelleCorrigee: false,
    echelleIncertaine: false,
    dateTarif: null,
    etatBrut: null,
    actif: true,
    societe: 'KA',
    ...surcharge,
  };
}

describe('construireLots', () => {
  it('regroupe des identifiants consecutifs du meme tiers', () => {
    const lots = construireLots([
      tarif({ sourceLigneId: 5398396, sourceTiersId: 566745 }),
      tarif({ sourceLigneId: 5398400, sourceTiersId: 566745 }),
      tarif({ sourceLigneId: 5398410, sourceTiersId: 566745 }),
    ]);
    expect(lots).toHaveLength(1);
    expect(lots[0]?.tarifs).toHaveLength(3);
    expect(lots[0]?.premierLigneId).toBe(5398396);
    expect(lots[0]?.dernierLigneId).toBe(5398410);
  });

  it('ouvre un nouveau lot quand le tiers change', () => {
    const lots = construireLots([
      tarif({ sourceLigneId: 100, sourceTiersId: 1 }),
      tarif({ sourceLigneId: 101, sourceTiersId: 2 }),
    ]);
    expect(lots).toHaveLength(2);
  });

  it('ouvre un nouveau lot apres une longue interruption d identifiants', () => {
    const lots = construireLots([
      tarif({ sourceLigneId: 100, sourceTiersId: 1 }),
      tarif({ sourceLigneId: 100 + ECART_ID_NOUVEAU_LOT + 1, sourceTiersId: 1 }),
    ]);
    expect(lots).toHaveLength(2);
  });

  it('ignore les tarifs sans prix, qui n ont pas d echelle a trancher', () => {
    const lots = construireLots([
      tarif({ sourceLigneId: 1, prixLuCentimes: null, prixCentimes: null }),
      tarif({ sourceLigneId: 2 }),
    ]);
    expect(lots).toHaveLength(1);
    expect(lots[0]?.tarifs).toHaveLength(1);
  });

  it('calcule la mediane sur la valeur LUE, pas sur la valeur corrigee', () => {
    // Trois lignes saisies en milliers : 2,00 / 4,00 / 90,00 Ar.
    // La mediane doit refleter l'unite de saisie (4), pas le prix corrige.
    const lots = construireLots([
      tarif({ sourceLigneId: 1, prixLuCentimes: 200, prixCentimes: 200_000, echelle: 'milliers_certain' }),
      tarif({ sourceLigneId: 2, prixLuCentimes: 400, prixCentimes: 400_000, echelle: 'milliers_certain' }),
      tarif({ sourceLigneId: 3, prixLuCentimes: 9_000, prixCentimes: 9_000_000, echelle: 'milliers_certain' }),
    ]);
    expect(lots[0]?.medianeAriary).toBe(4);
    expect(lots[0]?.minAriary).toBe(2);
    expect(lots[0]?.maxAriary).toBe(90);
  });

  it('signale un lot qui melange les deux echelles', () => {
    const lots = construireLots([
      tarif({ sourceLigneId: 1, prixLuCentimes: 900, echelle: 'milliers_certain' }),
      tarif({ sourceLigneId: 2, prixLuCentimes: 22_630_000, echelle: 'ariary_certain' }),
    ]);
    expect(lots[0]?.echellesMelangees).toBe(true);
  });

  it('ne demande un arbitrage que si une ligne est reellement incertaine', () => {
    const sansDoute = construireLots([
      tarif({ sourceLigneId: 1, echelle: 'ariary_certain', echelleIncertaine: false }),
    ]);
    expect(sansDoute[0]?.demandeArbitrage).toBe(false);

    const avecDoute = construireLots([
      tarif({ sourceLigneId: 1, echelle: 'a_arbitrer', echelleIncertaine: true }),
    ]);
    expect(avecDoute[0]?.demandeArbitrage).toBe(true);
  });
});

describe('synthetiserLots', () => {
  it('compte les lots et les lignes a arbitrer', () => {
    const lots = construireLots([
      tarif({ sourceLigneId: 1, sourceTiersId: 1, echelleIncertaine: true }),
      tarif({ sourceLigneId: 2, sourceTiersId: 1, echelleIncertaine: true }),
      tarif({ sourceLigneId: 3, sourceTiersId: 2, echelle: 'ariary_certain' }),
    ]);
    expect(synthetiserLots(lots)).toMatchObject({
      nombreLots: 2,
      lotsADemanderArbitrage: 1,
      lignesAArbitrer: 2,
    });
  });

  it('ne compte rien sur une liste vide', () => {
    expect(synthetiserLots([])).toMatchObject({ nombreLots: 0, lignesAArbitrer: 0 });
  });
});
