import { describe, expect, it } from 'vitest';
import { extraire, interpreterEtat, interpreterQualite } from '../src/import/extraction.js';
import type { LigneBrute } from '../src/import/schema.js';

/** Construit une ligne brute au format du module 21, champs par defaut vides. */
function ligne(surcharge: Partial<Record<string, unknown>> = {}): LigneBrute {
  return {
    id: 1,
    societeId: 'KA',
    assoc__produit__id: 0,
    assoc__produit__327: '',
    assoc__produit__762: '',
    assoc__produit__3289: '',
    assoc__client__id: 0,
    assoc__client__326: '',
    assoc__client__3434: '',
    designActeur: '',
    codeActeur: '',
    tarifFinale: '0.00',
    famille: '',
    etat: '',
    date: '',
    Image: { total: 0, img: 0 },
    ...surcharge,
  };
}

const LE_16_SEPTEMBRE_2026 = new Date('2026-09-16T00:00:00Z');

describe('interpreterQualite', () => {
  it('traduit les codes du portail', () => {
    expect(interpreterQualite('F')).toBe('fournisseur');
    expect(interpreterQualite('f')).toBe('fournisseur');
    expect(interpreterQualite('c')).toBe('client');
    expect(interpreterQualite('p')).toBe('prospect');
    expect(interpreterQualite('P')).toBe('prospect');
    expect(interpreterQualite('')).toBe('inconnue');
    expect(interpreterQualite('X')).toBe('inconnue');
  });
});

describe('interpreterEtat', () => {
  it('ne considere inactif que NA', () => {
    expect(interpreterEtat('a')).toBe(true);
    expect(interpreterEtat('A')).toBe(true);
    expect(interpreterEtat('')).toBe(true);
    expect(interpreterEtat('NA')).toBe(false);
    expect(interpreterEtat(' na ')).toBe(false);
  });
});

describe('extraire', () => {
  it('reconstitue produit, tiers et tarif depuis une ligne complete', () => {
    const resultat = extraire(
      [
        ligne({
          id: 5983631,
          assoc__produit__id: 20456,
          assoc__produit__327: 'Multiprise 3p 2p+t 1,5m fixable',
          assoc__produit__762: 'savbar08',
          assoc__client__id: 566745,
          assoc__client__326: 'FIBASO4001',
          assoc__client__3434: 'F',
          tarifFinale: '17.60',
          etat: 'a',
          date: '260312',
        }),
      ],
      LE_16_SEPTEMBRE_2026,
    );

    expect(resultat.produits).toHaveLength(1);
    expect(resultat.produits[0]).toMatchObject({
      sourceProduitId: 20456,
      nom: 'Multiprise 3p 2p+t 1,5m fixable',
      nomNormalise: 'multiprise 3p 2p t 1 5m fixable',
      codeProduitA: 'savbar08',
      nombreTarifs: 1,
    });
    expect(resultat.tiers[0]).toMatchObject({
      sourceTiersId: 566745,
      code: 'FIBASO4001',
      qualite: 'fournisseur',
    });
    expect(resultat.tarifs[0]).toMatchObject({
      sourceLigneId: 5983631,
      sourceProduitId: 20456,
      sourceTiersId: 566745,
      dateTarif: '2026-03-12',
      actif: true,
    });
  });

  it('corrige les prix saisis en milliers et le signale', () => {
    const resultat = extraire([ligne({ id: 10, tarifFinale: '8.50', designActeur: 'peinture' })]);
    const tarif = resultat.tarifs[0];

    expect(tarif?.prixLuCentimes).toBe(850);
    expect(tarif?.prixCentimes).toBe(850_000); // 8 500,00 Ar
    expect(tarif?.echelleCorrigee).toBe(true);
    expect(tarif?.echelleIncertaine).toBe(false);
    expect(resultat.anomalies.some((a) => a.type === 'echelle_corrigee_automatiquement')).toBe(true);
  });

  it('laisse la zone grise non corrigee mais marquee', () => {
    const resultat = extraire([
      ligne({ id: 11, tarifFinale: '203.00', designActeur: 'meuleuse angulaire 950w INGCO' }),
    ]);
    const tarif = resultat.tarifs[0];

    expect(tarif?.prixCentimes).toBe(20_300); // laisse tel quel : 203,00 Ar
    expect(tarif?.echelleCorrigee).toBe(false);
    expect(tarif?.echelleIncertaine).toBe(true);
    expect(resultat.anomalies.some((a) => a.type === 'echelle_a_arbitrer')).toBe(true);
  });

  it('laisse intacts les prix clairement en ariary', () => {
    const resultat = extraire([ligne({ id: 12, tarifFinale: '34400.00', designActeur: 'ciment' })]);
    expect(resultat.tarifs[0]).toMatchObject({
      prixCentimes: 3_440_000,
      echelleCorrigee: false,
      echelleIncertaine: false,
    });
  });

  it('rejette les lignes qui ne designent rien', () => {
    const resultat = extraire([ligne({ id: 13 })]);
    expect(resultat.tarifs).toHaveLength(0);
    expect(resultat.lignesRejetees).toBe(1);
    expect(resultat.anomalies.some((a) => a.type === 'ligne_totalement_vide')).toBe(true);
  });

  it('signale le montant perdu quand une ligne rejetee portait un prix', () => {
    // 25 lignes du fichier KA sont dans ce cas : un prix, mais rien qui
    // identifie le produit. On les ecarte, jamais en silence.
    const resultat = extraire([ligne({ id: 5165468, tarifFinale: '70.00' })]);
    const anomalie = resultat.anomalies.find((a) => a.type === 'ligne_totalement_vide');
    expect(anomalie?.detail).toContain('Prix perdu : "70.00"');
  });

  it('conserve les lignes sans produit mais avec designation libre', () => {
    const resultat = extraire([
      ligne({ id: 14, designActeur: 'Chargeur PC 19V 6,31A', tarifFinale: '80.00' }),
    ]);
    expect(resultat.tarifs).toHaveLength(1);
    expect(resultat.tarifs[0]?.sourceProduitId).toBeNull();
    expect(resultat.tarifs[0]?.designationNormalisee).toBe('chargeur pc 19v 6 31a');
    expect(resultat.anomalies.some((a) => a.type === 'tarif_sans_produit_lie')).toBe(true);
  });

  it('deduplique sur l identifiant de ligne source', () => {
    const resultat = extraire([
      ligne({ id: 99, designActeur: 'vis', tarifFinale: '5000.00' }),
      ligne({ id: 99, designActeur: 'vis', tarifFinale: '9000.00' }),
    ]);
    expect(resultat.tarifs).toHaveLength(1);
    expect(resultat.lignesRejetees).toBe(1);
    expect(resultat.anomalies.some((a) => a.type === 'doublon_ligne_source')).toBe(true);
  });

  it('agrege plusieurs tarifs sur un meme produit sans le dupliquer', () => {
    const resultat = extraire([
      ligne({
        id: 1,
        assoc__produit__id: 17299,
        assoc__produit__327: 'ciment 50 kg cpa 42.5',
        assoc__client__id: 577855,
        tarifFinale: '34400.00',
      }),
      ligne({
        id: 2,
        assoc__produit__id: 17299,
        assoc__produit__327: 'ciment 50 kg cpa 42.5',
        assoc__client__id: 577855,
        tarifFinale: '38000.00',
      }),
    ]);

    expect(resultat.produits).toHaveLength(1);
    expect(resultat.produits[0]?.nombreTarifs).toBe(2);
    expect(resultat.tarifs).toHaveLength(2);
    expect(resultat.anomalies.some((a) => a.type === 'doublon_tiers_produit')).toBe(true);
  });

  it('signale un code produit partage par deux produits differents', () => {
    const resultat = extraire([
      ligne({ id: 1, assoc__produit__id: 100, assoc__produit__327: 'tube A', assoc__produit__762: 'ppr20' }),
      ligne({ id: 2, assoc__produit__id: 200, assoc__produit__327: 'tube B', assoc__produit__762: 'ppr20' }),
    ]);
    expect(resultat.anomalies.some((a) => a.type === 'code_produit_partage')).toBe(true);
  });

  it('signale deux produits differents portant le meme nom', () => {
    const resultat = extraire([
      ligne({ id: 1, assoc__produit__id: 17644, assoc__produit__327: 'meche de 4' }),
      ligne({ id: 2, assoc__produit__id: 17147, assoc__produit__327: 'Meche de 4' }),
    ]);
    expect(resultat.anomalies.some((a) => a.type === 'nom_partage_par_plusieurs_produits')).toBe(true);
  });

  it('repare l encodage des libelles au passage', () => {
    const resultat = extraire([
      ligne({ id: 1, designActeur: 'HOMEOPULMINE Flc de 30 comprimÃ©s', tarifFinale: '5000.00' }),
    ]);
    expect(resultat.tarifs[0]?.designationLibre).toBe('HOMEOPULMINE Flc de 30 comprimés');
    expect(resultat.anomalies.some((a) => a.type === 'libelle_mojibake_repare')).toBe(true);
  });

  it('marque inactive une ligne dont l etat vaut NA', () => {
    const resultat = extraire([ligne({ id: 1, designActeur: 'vis', etat: 'NA' })]);
    expect(resultat.tarifs[0]?.actif).toBe(false);
  });

  it('refuse une date posterieure a aujourd hui', () => {
    const resultat = extraire(
      [ligne({ id: 1, designActeur: 'vis', date: '991231' })],
      LE_16_SEPTEMBRE_2026,
    );
    expect(resultat.tarifs[0]?.dateTarif).toBeNull();
    expect(resultat.anomalies.some((a) => a.type === 'date_illisible')).toBe(true);
  });

  it('accepte mnk__key__id quand id est absent', () => {
    const brute = ligne({ designActeur: 'vis' });
    delete (brute as Record<string, unknown>)['id'];
    (brute as Record<string, unknown>)['mnk__key__id'] = 4242;
    expect(extraire([brute]).tarifs[0]?.sourceLigneId).toBe(4242);
  });
});
