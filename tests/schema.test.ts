import { describe, expect, it } from 'vitest';
import { validerFichier } from '../src/import/schema.js';
import { parseDateAAMMJJ } from '../src/domaine/dates.js';

const FICHIER_MINIMAL = {
  moduleId: 21,
  viewId: '54',
  societeFilter: 'KA',
  rows: [
    {
      id: 1,
      assoc__produit__id: 0,
      assoc__produit__327: '',
      assoc__client__id: 0,
      assoc__client__326: '',
      tarifFinale: '0.00',
      designActeur: 'vis',
    },
  ],
};

describe('validerFichier', () => {
  it('accepte un export conforme', () => {
    const resultat = validerFichier(FICHIER_MINIMAL);
    expect(resultat.ok).toBe(true);
  });

  it('accepte des colonnes inconnues sans broncher', () => {
    const resultat = validerFichier({
      ...FICHIER_MINIMAL,
      rows: [{ ...FICHIER_MINIMAL.rows[0], colonneAjouteeDemain: 'valeur' }],
    });
    expect(resultat.ok).toBe(true);
  });

  it('refuse un fichier sans lignes exploitables', () => {
    expect(validerFichier({ moduleId: 21 }).ok).toBe(false);
    expect(validerFichier(null).ok).toBe(false);
    expect(validerFichier({ rows: [] }).ok).toBe(false);
  });

  it('avertit quand des enregistrements manquent a l appel', () => {
    const resultat = validerFichier({ ...FICHIER_MINIMAL, expectedTotal: 3179, totalRecords: 3172 });
    if (!resultat.ok) throw new Error('validation attendue en succes');
    expect(resultat.avertissements.join(' ')).toContain('7 enregistrement');
  });

  it('avertit quand l export ne vient pas du bon module', () => {
    const resultat = validerFichier({ moduleId: 7, rows: [{ id: 1, autreChose: 'x' }] });
    if (!resultat.ok) throw new Error('validation attendue en succes');
    expect(resultat.avertissements.join(' ')).toContain('tarifs tiers');
  });
});

describe('parseDateAAMMJJ', () => {
  const reference = new Date('2026-09-16T00:00:00Z');

  it('lit le format AAMMJJ du portail', () => {
    expect(parseDateAAMMJJ('260902', reference)).toEqual({ ok: true, iso: '2026-09-02' });
    expect(parseDateAAMMJJ('230324', reference)).toEqual({ ok: true, iso: '2023-03-24' });
  });

  it('refuse ce qui n est pas une date', () => {
    expect(parseDateAAMMJJ('', reference)).toMatchObject({ ok: false, raison: 'vide' });
    expect(parseDateAAMMJJ('2609', reference)).toMatchObject({ ok: false, raison: 'format' });
    expect(parseDateAAMMJJ('261301', reference)).toMatchObject({ ok: false, raison: 'invalide' });
    expect(parseDateAAMMJJ('260230', reference)).toMatchObject({ ok: false, raison: 'invalide' });
  });

  it('refuse une date dans le futur', () => {
    expect(parseDateAAMMJJ('991231', reference)).toMatchObject({ ok: false, raison: 'future' });
  });
});
