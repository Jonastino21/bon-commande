import { beforeEach, describe, expect, it } from 'vitest';
import { creerBdd, type Bdd } from '../src/bdd/connexion.js';
import { ingererImportInitial } from '../src/bdd/ingestion.js';
import { construireRequeteFts, listerCatalogue, rechercher } from '../src/bdd/recherche.js';
import {
  changerStatut,
  creerDocument,
  listerDocuments,
  mettreAJourDocument,
  obtenirDocument,
  statistiques,
} from '../src/bdd/documents.js';
import { extraire } from '../src/import/extraction.js';
import { construireLots } from '../src/import/lots.js';
import { construireRapport } from '../src/import/rapport.js';
import { quantiteEnMilliemes } from '../src/domaine/monnaie.js';
import type { LigneBrute } from '../src/import/schema.js';

function ligne(surcharge: Record<string, unknown>): LigneBrute {
  return {
    societeId: 'KA',
    assoc__produit__id: 0,
    assoc__produit__327: '',
    assoc__produit__762: '',
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

const LIGNES = [
  ligne({
    id: 1,
    assoc__produit__id: 17299,
    assoc__produit__327: 'ciment 50 kg cpa 42.5',
    assoc__client__id: 100,
    assoc__client__326: 'CROBLO4000',
    assoc__client__3434: 'F',
    tarifFinale: '38000.00',
    etat: 'a',
  }),
  ligne({
    id: 2,
    assoc__produit__id: 17299,
    assoc__produit__327: 'ciment 50 kg cpa 42.5',
    assoc__client__id: 101,
    assoc__client__326: 'FIBAFE0000',
    assoc__client__3434: 'F',
    tarifFinale: '28166.67',
    etat: 'a',
  }),
  ligne({
    id: 3,
    assoc__produit__id: 20456,
    assoc__produit__327: 'Multiprise 3p 2p+t 1,5m fixable',
    assoc__client__id: 100,
    assoc__client__326: 'CROBLO4000',
    assoc__client__3434: 'F',
    tarifFinale: '17.60',
    etat: 'a',
  }),
  // Tarif archive : son produit doit rester trouvable malgre tout.
  ligne({
    id: 4,
    assoc__produit__id: 30000,
    assoc__produit__327: 'brosse à linge',
    assoc__client__id: 102,
    assoc__client__326: 'GIFIOO4001',
    assoc__client__3434: 'F',
    tarifFinale: '6500.00',
    etat: 'NA',
  }),
  ligne({ id: 5, designActeur: 'HOMEOPULMINE Flc de 30 comprimÃ©s', tarifFinale: '12000.00', etat: 'a' }),
];

function baseGarnie(): Bdd {
  const bdd = creerBdd(':memory:');
  const extraction = extraire(LIGNES, new Date('2026-09-16T00:00:00Z'));
  const rapport = construireRapport({
    nomFichier: 'essai.json',
    tailleOctets: 1000,
    fichier: { moduleId: 21, rows: [], skippedRecords: [], fields: {} } as never,
    extraction,
    lots: construireLots(extraction.tarifs),
    avertissements: [],
  });
  ingererImportInitial(bdd, extraction, rapport);
  return bdd;
}

describe('construireRequeteFts', () => {
  it('transforme chaque mot en prefixe', () => {
    expect(construireRequeteFts('ciment 50')).toBe('"ciment"* "50"*');
  });

  it('neutralise la ponctuation qui serait prise pour un operateur FTS', () => {
    expect(construireRequeteFts('ciment* OR "x"')).toBe('"ciment"* "or"* "x"*');
    expect(construireRequeteFts('30*30')).toBe('"30"* "30"*');
  });

  it('renvoie null sur une saisie vide', () => {
    expect(construireRequeteFts('   ')).toBeNull();
    expect(construireRequeteFts('!!!')).toBeNull();
  });
});

describe('ingestion puis recherche', () => {
  let bdd: Bdd;
  beforeEach(() => {
    bdd = baseGarnie();
  });

  it('remplit le catalogue', () => {
    const stats = statistiques(bdd);
    // 3 produits rattaches : la 5e ligne est une designation libre, elle
    // produit un tarif mais aucun produit.
    expect(stats.produitsActifs).toBe(3);
    expect(stats.tarifsAvecPrix).toBe(5);
  });

  it('regroupe les fournisseurs sous un meme produit, le moins cher en tete', () => {
    const resultats = rechercher(bdd, 'ciment');
    expect(resultats).toHaveLength(1);
    expect(resultats[0]?.offres).toHaveLength(2);
    expect(resultats[0]?.meilleurPrixCentimes).toBe(2_816_667);
    expect(resultats[0]?.offres[0]?.fournisseurCode).toBe('FIBAFE0000');
  });

  it('cherche sans accent et sans respecter la casse', () => {
    expect(rechercher(bdd, 'comprimes')).toHaveLength(1);
    expect(rechercher(bdd, 'COMPRIMÉS')).toHaveLength(1);
    expect(rechercher(bdd, 'brosse a linge')).toHaveLength(1);
  });

  it('trouve par prefixe des le debut de la saisie', () => {
    expect(rechercher(bdd, 'cim')).toHaveLength(1);
    expect(rechercher(bdd, 'multipri')).toHaveLength(1);
  });

  it('montre les tarifs archives au lieu de faire disparaitre le produit', () => {
    const resultats = rechercher(bdd, 'brosse');
    expect(resultats).toHaveLength(1);
    expect(resultats[0]?.tousTarifsArchives).toBe(true);
    expect(resultats[0]?.offres[0]?.actif).toBe(false);
    expect(resultats[0]?.meilleurPrixCentimes).toBe(650_000);
  });

  it('applique la correction d echelle jusque dans la recherche', () => {
    // 17,60 saisi = 17 600 Ar reels.
    expect(rechercher(bdd, 'multiprise')[0]?.meilleurPrixCentimes).toBe(1_760_000);
  });

  it('ne renvoie rien sur une saisie vide', () => {
    expect(rechercher(bdd, '')).toEqual([]);
  });

  it('liste le catalogue par ordre alphabetique', () => {
    const page = listerCatalogue(bdd, { parPage: 10 });
    expect(page.total).toBe(3);
    expect(page.resultats.map((resultat) => resultat.libelle)).toEqual([
      'brosse à linge',
      'ciment 50 kg cpa 42.5',
      'Multiprise 3p 2p+t 1,5m fixable',
    ]);
  });
});

describe('documents', () => {
  let bdd: Bdd;
  beforeEach(() => {
    bdd = baseGarnie();
  });

  const lignesAchat = [
    {
      tarifId: 2,
      produitId: 2,
      nomProduit: 'ciment 50 kg cpa 42.5',
      reference: null,
      fournisseur: 'FIBAFE0000',
      unite: null,
      prixCatalogueCentimes: 2_816_667,
      prixUnitaireCentimes: 2_816_667,
      quantiteMilliemes: quantiteEnMilliemes(3),
    },
  ];

  it('cree un document numerote et calcule son total', () => {
    const document = creerDocument(bdd, {
      dateDocument: '2026-09-16',
      tiersLibelle: 'FIBAFE0000',
      lignes: lignesAchat,
    });

    expect(document.numero).toBe('BON-2026-0001');
    expect(document.statut).toBe('brouillon');
    expect(document.lignes[0]?.sousTotalCentimes).toBe(8_450_001);
    expect(document.totalCentimes).toBe(8_450_001);
  });

  it('numerote sans collision, et repart a 1 chaque annee', () => {
    creerDocument(bdd, { dateDocument: '2026-09-16', lignes: [] });
    const deuxieme = creerDocument(bdd, { dateDocument: '2026-09-16', lignes: [] });
    const anneeSuivante = creerDocument(bdd, { dateDocument: '2027-01-02', lignes: [] });

    expect(deuxieme.numero).toBe('BON-2026-0002');
    expect(anneeSuivante.numero).toBe('BON-2027-0001');
  });

  it('marque un prix modifie manuellement sans croire le navigateur', () => {
    const document = creerDocument(bdd, {
      dateDocument: '2026-09-16',
      lignes: [{ ...lignesAchat[0]!, prixUnitaireCentimes: 3_000_000 }],
    });
    expect(document.lignes[0]?.prixModifieManuellement).toBe(true);
    expect(document.totalCentimes).toBe(9_000_000);
  });

  it('gere les quantites decimales', () => {
    const document = creerDocument(bdd, {
      dateDocument: '2026-09-16',
      lignes: [
        {
          ...lignesAchat[0]!,
          prixUnitaireCentimes: 850_000,
          quantiteMilliemes: quantiteEnMilliemes(2.5),
        },
      ],
    });
    expect(document.totalCentimes).toBe(2_125_000);
  });

  it('conserve le prix applique meme si le catalogue change ensuite', () => {
    const document = creerDocument(bdd, {
      dateDocument: '2026-09-16',
      lignes: lignesAchat,
    });

    // Le prix catalogue evolue apres coup...
    bdd.prepare('update tarif set prix_centimes = 9999999 where id = 2').run();

    // ...le document, lui, ne bouge pas.
    const relu = obtenirDocument(bdd, document.id);
    expect(relu?.lignes[0]?.prixUnitaireCentimes).toBe(2_816_667);
    expect(relu?.totalCentimes).toBe(8_450_001);
  });

  it('survit a la suppression complete du catalogue', () => {
    const document = creerDocument(bdd, {
      dateDocument: '2026-09-16',
      lignes: lignesAchat,
    });

    bdd.exec('delete from tarif_recherche');
    bdd.exec('delete from tarif');
    bdd.exec('delete from produit');

    const relu = obtenirDocument(bdd, document.id);
    expect(relu?.lignes[0]?.nomProduit).toBe('ciment 50 kg cpa 42.5');
    expect(relu?.lignes[0]?.fournisseur).toBe('FIBAFE0000');
    expect(relu?.totalCentimes).toBe(8_450_001);
  });

  it('refuse de modifier un document finalise', () => {
    const document = creerDocument(bdd, {
      dateDocument: '2026-09-16',
      lignes: lignesAchat,
    });
    changerStatut(bdd, document.id, 'finalise');

    expect(() =>
      mettreAJourDocument(bdd, document.id, { dateDocument: '2026-09-17', lignes: [] }),
    ).toThrow(/finalise/);
  });

  it('autorise l annulation d un document finalise', () => {
    const document = creerDocument(bdd, { dateDocument: '2026-09-16', lignes: [] });
    changerStatut(bdd, document.id, 'finalise');
    const annule = mettreAJourDocument(bdd, document.id, {
      dateDocument: '2026-09-16',
      statut: 'annule',
      lignes: [],
    });
    expect(annule?.statut).toBe('annule');
  });

  it('retrouve un document par un produit qu il contient', () => {
    creerDocument(bdd, {
      dateDocument: '2026-09-16',
      tiersLibelle: 'FIBAFE0000',
      lignes: lignesAchat,
    });

    expect(listerDocuments(bdd, { recherche: 'ciment' })).toHaveLength(1);
    expect(listerDocuments(bdd, { recherche: 'FIBAFE' })).toHaveLength(1);
    expect(listerDocuments(bdd, { recherche: 'inexistant' })).toHaveLength(0);
  });

  it('filtre par statut', () => {
    creerDocument(bdd, { dateDocument: '2026-09-16', lignes: [] });
    creerDocument(bdd, { dateDocument: '2026-09-16', lignes: [] });

    expect(listerDocuments(bdd, { statut: 'brouillon' })).toHaveLength(2);
    expect(listerDocuments(bdd, { statut: 'finalise' })).toHaveLength(0);
  });

  it('renumerote les lignes a la mise a jour', () => {
    const document = creerDocument(bdd, {
      dateDocument: '2026-09-16',
      lignes: [lignesAchat[0]!, { ...lignesAchat[0]!, quantiteMilliemes: quantiteEnMilliemes(1) }],
    });
    const modifie = mettreAJourDocument(bdd, document.id, {
      dateDocument: '2026-09-16',
      lignes: [lignesAchat[0]!],
    });
    expect(modifie?.lignes).toHaveLength(1);
    expect(modifie?.lignes[0]?.numeroLigne).toBe(1);
  });
});

describe('remplacement du catalogue', () => {
  it('efface le catalogue sans toucher aux documents', () => {
    const bdd = baseGarnie();
    const document = creerDocument(bdd, {
      dateDocument: '2026-09-16',
      lignes: [
        {
          tarifId: 1,
          produitId: 1,
          nomProduit: 'ciment 50 kg cpa 42.5',
          reference: null,
          fournisseur: 'CROBLO4000',
          unite: null,
          prixCatalogueCentimes: 3_800_000,
          prixUnitaireCentimes: 3_800_000,
          quantiteMilliemes: quantiteEnMilliemes(1),
        },
      ],
    });

    const extraction = extraire([LIGNES[0]!], new Date('2026-09-16T00:00:00Z'));
    const rapport = construireRapport({
      nomFichier: 'essai2.json',
      tailleOctets: 10,
      fichier: { moduleId: 21, rows: [], skippedRecords: [], fields: {} } as never,
      extraction,
      lots: construireLots(extraction.tarifs),
      avertissements: [],
    });
    ingererImportInitial(bdd, extraction, rapport, { remplacer: true });

    expect(statistiques(bdd).produitsActifs).toBe(1);
    const relu = obtenirDocument(bdd, document.id);
    expect(relu?.totalCentimes).toBe(3_800_000);
    expect(relu?.lignes[0]?.nomProduit).toBe('ciment 50 kg cpa 42.5');
  });
});
