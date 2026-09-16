import { beforeEach, describe, expect, it } from 'vitest';
import { construireServeur } from '../src/serveur/serveur.js';
import { creerBdd, type Bdd } from '../src/bdd/connexion.js';
import { ingererImportInitial } from '../src/bdd/ingestion.js';
import { extraire } from '../src/import/extraction.js';
import { construireLots } from '../src/import/lots.js';
import { construireRapport } from '../src/import/rapport.js';
import type { LigneBrute } from '../src/import/schema.js';

function baseGarnie(): Bdd {
  const lignes: LigneBrute[] = [
    {
      id: 1,
      assoc__produit__id: 17299,
      assoc__produit__327: 'ciment 50 kg cpa 42.5',
      assoc__client__id: 100,
      assoc__client__326: 'CROBLO4000',
      assoc__client__3434: 'F',
      tarifFinale: '38000.00',
      etat: 'a',
      designActeur: '',
      codeActeur: '',
      famille: '',
      date: '',
      societeId: 'KA',
    },
  ];
  const bdd = creerBdd(':memory:');
  const extraction = extraire(lignes, new Date('2026-09-16T00:00:00Z'));
  ingererImportInitial(
    bdd,
    extraction,
    construireRapport({
      nomFichier: 'essai.json',
      tailleOctets: 10,
      fichier: { moduleId: 21, rows: [], skippedRecords: [], fields: {} } as never,
      extraction,
      lots: construireLots(extraction.tarifs),
      avertissements: [],
    }),
  );
  return bdd;
}

const LIGNE_VALIDE = {
  tarifId: 1,
  produitId: 1,
  nomProduit: 'ciment 50 kg cpa 42.5',
  reference: null,
  fournisseur: 'CROBLO4000',
  unite: null,
  prixCatalogueCentimes: 3_800_000,
  prixUnitaireCentimes: 3_800_000,
  quantiteMilliemes: 3000,
};

describe('API', () => {
  let app: ReturnType<typeof construireServeur>;

  beforeEach(() => {
    app = construireServeur(baseGarnie());
  });

  it('expose les statistiques du tableau de bord', async () => {
    const reponse = await app.inject({ method: 'GET', url: '/api/statistiques' });
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toMatchObject({ produitsActifs: 1, tarifsAvecPrix: 1 });
  });

  it('cherche un produit', async () => {
    const reponse = await app.inject({ method: 'GET', url: '/api/recherche?q=ciment' });
    expect(reponse.json().resultats).toHaveLength(1);
    expect(reponse.json().resultats[0].meilleurPrixCentimes).toBe(3_800_000);
  });

  it('ne renvoie rien sur une recherche vide, sans planter', async () => {
    const reponse = await app.inject({ method: 'GET', url: '/api/recherche?q=' });
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json().resultats).toEqual([]);
  });

  it('cree un document et recalcule son total', async () => {
    const reponse = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { dateDocument: '2026-09-16', lignes: [LIGNE_VALIDE] },
    });
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json().numero).toBe('BON-2026-0001');
    expect(reponse.json().totalCentimes).toBe(11_400_000);
  });

  it('ignore le total envoye par le navigateur', async () => {
    const reponse = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: {
        dateDocument: '2026-09-16',
        totalCentimes: 1,
        lignes: [{ ...LIGNE_VALIDE, sousTotalCentimes: 1 }],
      },
    });
    // Le serveur recalcule : la valeur soufflee par le client est sans effet.
    expect(reponse.json().totalCentimes).toBe(11_400_000);
  });

  it('refuse une quantite nulle avec un message comprehensible', async () => {
    const reponse = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: {
        dateDocument: '2026-09-16',
        lignes: [{ ...LIGNE_VALIDE, quantiteMilliemes: 0 }],
      },
    });
    expect(reponse.statusCode).toBe(400);
    expect(reponse.json().erreur).toMatch(/quantite/i);
  });

  it('refuse un prix negatif', async () => {
    const reponse = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: {
        dateDocument: '2026-09-16',
        lignes: [{ ...LIGNE_VALIDE, prixUnitaireCentimes: -1 }],
      },
    });
    expect(reponse.statusCode).toBe(400);
  });

  it('refuse un type de document inconnu', async () => {
    const reponse = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { type: 'facture', dateDocument: '2026-09-16', lignes: [] },
    });
    expect(reponse.statusCode).toBe(400);
  });

  it('refuse une date mal formee', async () => {
    const reponse = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { dateDocument: '16/09/2026', lignes: [] },
    });
    expect(reponse.statusCode).toBe(400);
    expect(reponse.json().erreur).toMatch(/AAAA-MM-JJ/);
  });

  it('renvoie 404 sur un document inexistant', async () => {
    const reponse = await app.inject({ method: 'GET', url: '/api/documents/999' });
    expect(reponse.statusCode).toBe(404);
  });

  it('finalise puis refuse la modification, avec un message clair', async () => {
    const creation = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { dateDocument: '2026-09-16', lignes: [LIGNE_VALIDE] },
    });
    const id = creation.json().id;

    const finalisation = await app.inject({
      method: 'POST',
      url: `/api/documents/${id}/statut`,
      payload: { statut: 'finalise' },
    });
    expect(finalisation.json().statut).toBe('finalise');

    const modification = await app.inject({
      method: 'PUT',
      url: `/api/documents/${id}`,
      payload: { dateDocument: '2026-09-17', lignes: [] },
    });
    expect(modification.statusCode).toBe(409);
    expect(modification.json().erreur).toMatch(/finalise/);
  });

  it('liste et filtre l historique', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { dateDocument: '2026-09-16', lignes: [LIGNE_VALIDE] },
    });

    const tous = await app.inject({ method: 'GET', url: '/api/documents' });
    expect(tous.json().documents).toHaveLength(1);

    const parProduit = await app.inject({ method: 'GET', url: '/api/documents?recherche=ciment' });
    expect(parProduit.json().documents).toHaveLength(1);

    const autreTerme = await app.inject({ method: 'GET', url: '/api/documents?recherche=inexistant' });
    expect(autreTerme.json().documents).toHaveLength(0);
  });
});
