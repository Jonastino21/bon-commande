import { describe, expect, it } from 'vitest';
import {
  classerEchelle,
  corrigerMilliers,
  formaterAriary,
  parseMontant,
  quantiteEnMilliemes,
  sousTotal,
  totalGeneral,
} from '../src/domaine/monnaie.js';

describe('parseMontant', () => {
  it('convertit les formats presents dans l export', () => {
    expect(parseMontant('34400.00')).toMatchObject({ ok: true, centimes: 3_440_000 });
    expect(parseMontant('8.50')).toMatchObject({ ok: true, centimes: 850 });
    expect(parseMontant('0.10')).toMatchObject({ ok: true, centimes: 10 });
    expect(parseMontant('12500000.00')).toMatchObject({ ok: true, centimes: 1_250_000_000 });
  });

  it('ne perd pas de centime sur les valeurs qui piegent le flottant', () => {
    expect(parseMontant('28166.67')).toMatchObject({ ok: true, centimes: 2_816_667 });
    expect(parseMontant('6666.67')).toMatchObject({ ok: true, centimes: 666_667 });
    expect(parseMontant('5833.34')).toMatchObject({ ok: true, centimes: 583_334 });
    expect(parseMontant('1408.75')).toMatchObject({ ok: true, centimes: 140_875 });
  });

  /**
   * Ces quatre valeurs sont celles qui cassent REELLEMENT la multiplication
   * flottante. Elles sont verifiees en deux temps : d'abord la preuve que le
   * piege existe, ensuite la preuve que parseMontant y echappe.
   *
   * Sans ce test, quelqu'un peut remplacer le decoupage textuel par un
   * Math.round(parseFloat(x) * 100), voir les 123 autres tests passer au
   * vert, et expedier un bon de commande amputes d'un centime par ligne.
   */
  it('les valeurs ou la multiplication flottante perd vraiment un centime', () => {
    const pieges: ReadonlyArray<[string, number]> = [
      ['0.29', 29],
      ['1.15', 115],
      ['4.35', 435],
      ['8.20', 820],
    ];

    for (const [brut, centimesAttendus] of pieges) {
      // Le piege est bien la : la troncature du produit flottant est fausse.
      expect(Math.trunc(parseFloat(brut) * 100)).toBe(centimesAttendus - 1);
      // Le decoupage textuel, lui, donne l'entier exact.
      expect(parseMontant(brut)).toMatchObject({ ok: true, centimes: centimesAttendus });
    }
  });

  it('accepte la virgule et les espaces', () => {
    expect(parseMontant('1 234,56')).toMatchObject({ ok: true, centimes: 123_456 });
  });

  it('complete les decimales manquantes', () => {
    expect(parseMontant('80')).toMatchObject({ ok: true, centimes: 8_000 });
    expect(parseMontant('80.5')).toMatchObject({ ok: true, centimes: 8_050 });
  });

  it('signale une troncature au lieu de l appliquer en silence', () => {
    const resultat = parseMontant('10.999');
    expect(resultat).toMatchObject({ ok: true, centimes: 1_099, decimalesTronquees: true });
  });

  it('refuse ce qui n est pas un montant', () => {
    expect(parseMontant('')).toMatchObject({ ok: false, raison: 'vide' });
    expect(parseMontant(null)).toMatchObject({ ok: false, raison: 'vide' });
    expect(parseMontant('N/A')).toMatchObject({ ok: false, raison: 'non_numerique' });
    expect(parseMontant('12.5.3')).toMatchObject({ ok: false, raison: 'non_numerique' });
    expect(parseMontant('-5.00')).toMatchObject({ ok: false, raison: 'negatif' });
    expect(parseMontant('99999999999')).toMatchObject({ ok: false, raison: 'hors_limites' });
  });
});

describe('classerEchelle', () => {
  it('range les valeurs certaines du bon cote', () => {
    expect(classerEchelle(850)).toBe('milliers_certain'); // 8,50 Ar
    expect(classerEchelle(176_0)).toBe('milliers_certain'); // 17,60 Ar
    expect(classerEchelle(3_440_000)).toBe('ariary_certain'); // 34 400 Ar
  });

  it('laisse la zone grise a l arbitrage humain', () => {
    expect(classerEchelle(20_300)).toBe('a_arbitrer'); // 203 Ar : meuleuse ou point baton ?
    expect(classerEchelle(20_000)).toBe('a_arbitrer'); // 200 Ar
    expect(classerEchelle(220_000)).toBe('a_arbitrer'); // 2 200 Ar : batterie ?
  });

  it('place les bornes exactement ou elles sont documentees', () => {
    expect(classerEchelle(99_99)).toBe('milliers_certain'); // 99,99 Ar
    expect(classerEchelle(100_00)).toBe('a_arbitrer'); // 100 Ar
    expect(classerEchelle(2999_99)).toBe('a_arbitrer');
    expect(classerEchelle(3000_00)).toBe('ariary_certain');
  });
});

describe('corrigerMilliers', () => {
  it('transforme 8,50 en 8 500 Ar', () => {
    expect(corrigerMilliers(850)).toBe(850_000);
    expect(formaterAriary(corrigerMilliers(850))).toBe('8 500,00 Ar');
  });
});

describe('calculs de document', () => {
  it('calcule un sous-total sur quantite entiere', () => {
    expect(sousTotal(4_500_000, quantiteEnMilliemes(3))).toBe(13_500_000);
  });

  it('gere les quantites decimales des unites au poids', () => {
    // 8 500 Ar/kg pour 2,5 kg = 21 250 Ar
    expect(sousTotal(850_000, quantiteEnMilliemes(2.5))).toBe(2_125_000);
    expect(formaterAriary(sousTotal(850_000, quantiteEnMilliemes(2.5)))).toBe('21 250,00 Ar');
  });

  it('reproduit l exemple du cahier des charges', () => {
    const clavier = sousTotal(4_500_000, quantiteEnMilliemes(3));
    const souris = sousTotal(3_000_000, quantiteEnMilliemes(2));
    expect(formaterAriary(clavier)).toBe('135 000,00 Ar');
    expect(formaterAriary(souris)).toBe('60 000,00 Ar');
    expect(formaterAriary(totalGeneral([clavier, souris]))).toBe('195 000,00 Ar');
  });

  it('ne derive pas sur une longue addition, la ou les flottants derivent', () => {
    const centimes = parseMontant('0.10');
    if (!centimes.ok) throw new Error('montant invalide');
    const lignes = Array.from({ length: 1000 }, () => centimes.centimes);
    expect(totalGeneral(lignes)).toBe(100_00); // exactement 100 Ar
  });

  it('additionne un total general vide sans erreur', () => {
    expect(totalGeneral([])).toBe(0);
  });
});

describe('formaterAriary', () => {
  it('affiche a la francaise avec separateur de milliers', () => {
    expect(formaterAriary(1_250_000_000)).toBe('12 500 000,00 Ar');
    expect(formaterAriary(2_816_667)).toBe('28 166,67 Ar');
    expect(formaterAriary(0)).toBe('0,00 Ar');
    expect(formaterAriary(5)).toBe('0,05 Ar');
  });

  it('accepte une autre devise', () => {
    expect(formaterAriary(100_00, 'MGA')).toBe('100,00 MGA');
  });
});
