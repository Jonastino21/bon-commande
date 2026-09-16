import { describe, expect, it } from 'vitest';
import {
  aPerteEncodage,
  nettoyerLibelle,
  normaliserEspaces,
  normaliserPourRecherche,
  reparerMojibake,
} from '../src/domaine/texte.js';

describe('reparerMojibake', () => {
  it('restaure les libelles doublement encodes du fichier KA', () => {
    // Cas reels releves dans l'export (128 occurrences).
    expect(reparerMojibake('HOMEOPULMINE Flc de 30 comprimÃ©s')).toEqual({
      valeur: 'HOMEOPULMINE Flc de 30 comprimés',
      repare: true,
    });
    expect(reparerMojibake('galÃ©rie photo').valeur).toBe('galérie photo');
    // Piege : le "a" accentue se deguise en "Ã" + espace INSECABLE (0xA0), qui
    // est le second octet de la sequence. L'espace ordinaire qui suit est le
    // vrai separateur de mots, et doit survivre.
    expect(reparerMojibake('brosse Ã  linge').valeur).toBe('brosse à linge');
  });

  it('remonte les octets Windows-1252, la ou Latin-1 echouerait', () => {
    // 0x9C (oe) et 0x92 (apostrophe typographique) n'existent pas en Latin-1.
    expect(reparerMojibake('Nutri-04-CÅ“ur ComprimÃ©s').valeur).toBe('Nutri-04-Cœur Comprimés');
    expect(reparerMojibake('dâ€™extincteur 2kg').valeur).toBe("d’extincteur 2kg");
    expect(reparerMojibake('Plan dâ€™Ã©vacuation+cadre (A3)').valeur).toBe(
      'Plan d’évacuation+cadre (A3)',
    );
  });

  it('repare un mojibake partiel sans abimer la partie deja correcte', () => {
    // Cas reel : "decharge" et "agreee" sont sains, seul le "²" est deguise.
    // Un decodage global de la chaine detruirait les accents corrects.
    expect(reparerMojibake('Mise au rebut en décharge agréée COÂ²').valeur).toBe(
      'Mise au rebut en décharge agréée CO²',
    );
  });

  it('laisse intact un texte deja correct', () => {
    expect(reparerMojibake('brosse à linge')).toEqual({ valeur: 'brosse à linge', repare: false });
    expect(reparerMojibake('ciment 50 kg cpa 42.5')).toEqual({
      valeur: 'ciment 50 kg cpa 42.5',
      repare: false,
    });
  });

  it('ne touche pas au texte sans signature de double encodage', () => {
    expect(reparerMojibake('pave calcaire blanc 150*200').repare).toBe(false);
  });
});

describe('aPerteEncodage', () => {
  it('detecte ce qui n est plus restaurable', () => {
    expect(aPerteEncodage('????')).toBe(true);
    expect(aPerteEncodage('caf�')).toBe(true);
  });

  it('ne confond pas une vraie interrogation avec une perte', () => {
    expect(aPerteEncodage('bajg (kampo) !')).toBe(false);
    expect(aPerteEncodage('ciment ?')).toBe(false);
  });
});

describe('normaliserEspaces', () => {
  it('reduit les espaces parasites releves dans l export', () => {
    expect(normaliserEspaces('Creation d un  calendrier ')).toBe('Creation d un calendrier');
    expect(normaliserEspaces('  Baum  ')).toBe('Baum');
    expect(normaliserEspaces('Mise a disposition pour referencement')).toBe(
      'Mise a disposition pour referencement',
    );
  });
});

describe('nettoyerLibelle', () => {
  it('enchaine reparation et normalisation en signalant ce qui a change', () => {
    const resultat = nettoyerLibelle('HOMEOGASTRINE Flc de 30 comprimÃ©s  ');
    expect(resultat.valeur).toBe('HOMEOGASTRINE Flc de 30 comprimés');
    expect(resultat.mojibakeRepare).toBe(true);
    expect(resultat.perteEncodage).toBe(false);
  });

  it('signale une perte sans pretendre l avoir reparee', () => {
    const resultat = nettoyerLibelle('????');
    expect(resultat.valeur).toBe('????');
    expect(resultat.perteEncodage).toBe(true);
    expect(resultat.mojibakeRepare).toBe(false);
  });

  it('accepte les valeurs absentes', () => {
    expect(nettoyerLibelle(null).valeur).toBe('');
    expect(nettoyerLibelle(undefined).valeur).toBe('');
  });
});

describe('normaliserPourRecherche', () => {
  it('rend la recherche insensible aux accents et a la casse', () => {
    expect(normaliserPourRecherche('galérie photo')).toBe('galerie photo');
    expect(normaliserPourRecherche('Réalisation d un site d ecommerce')).toBe(
      'realisation d un site d ecommerce',
    );
    expect(normaliserPourRecherche('brosse à linge')).toBe('brosse a linge');
  });

  it('neutralise la ponctuation qui separe les references', () => {
    expect(normaliserPourRecherche('pave calcaire blanc 150*200')).toBe('pave calcaire blanc 150 200');
    expect(normaliserPourRecherche('ciment 50 kg cpa 42.5')).toBe('ciment 50 kg cpa 42 5');
  });

  it('fait converger les deux ecritures d un meme produit', () => {
    expect(normaliserPourRecherche('Multiprise 3p 2p+t 1,5m fixable')).toBe(
      normaliserPourRecherche('MULTIPRISE 3P 2P+T 1.5M FIXABLE'),
    );
  });
});
