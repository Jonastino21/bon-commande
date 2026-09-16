import { describe, expect, it } from 'vitest';
import {
  fournisseurAProposer,
  fournisseursDistincts,
  melangeFournisseurs,
} from '../src/domaine/document.js';

const ligne = (fournisseur: string | null) => ({ fournisseur });

describe('fournisseursDistincts', () => {
  it('deduplique et ignore les lignes sans fournisseur', () => {
    expect(
      fournisseursDistincts([
        ligne('FIBASO4001'),
        ligne('FIBASO4001'),
        ligne(null),
        ligne('  '),
        ligne('CROBLO4000'),
      ]),
    ).toEqual(['FIBASO4001', 'CROBLO4000']);
  });

  it('ne voit aucun fournisseur dans un bon vide', () => {
    expect(fournisseursDistincts([])).toEqual([]);
  });

  it('ne se laisse pas tromper par les espaces autour du code', () => {
    expect(fournisseursDistincts([ligne('FIBASO4001'), ligne(' FIBASO4001 ')])).toEqual([
      'FIBASO4001',
    ]);
  });
});

describe('melangeFournisseurs', () => {
  it('reste silencieux quand tout vient du meme fournisseur', () => {
    expect(melangeFournisseurs([ligne('FIBASO4001'), ligne('FIBASO4001')])).toBe(false);
  });

  it('signale des que deux fournisseurs coexistent', () => {
    expect(melangeFournisseurs([ligne('FIBASO4001'), ligne('CROBLO4000')])).toBe(true);
  });

  it('ne signale rien quand une seule ligne porte un fournisseur', () => {
    expect(melangeFournisseurs([ligne('FIBASO4001'), ligne(null)])).toBe(false);
  });
});

describe('fournisseurAProposer', () => {
  it('propose le fournisseur de la toute premiere ligne', () => {
    expect(fournisseurAProposer('', [], 'FIBASO4001')).toBe('FIBASO4001');
  });

  it("n'ecrase jamais une saisie manuelle", () => {
    expect(fournisseurAProposer('Mon fournisseur', [], 'FIBASO4001')).toBeNull();
  });

  it('ne propose plus rien une fois le bon commence', () => {
    expect(fournisseurAProposer('', [ligne('CROBLO4000')], 'FIBASO4001')).toBeNull();
  });

  it('ne propose rien si le produit ajoute n a pas de fournisseur', () => {
    expect(fournisseurAProposer('', [], null)).toBeNull();
    expect(fournisseurAProposer('', [], '   ')).toBeNull();
  });
});
