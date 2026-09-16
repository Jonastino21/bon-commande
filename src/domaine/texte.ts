/**
 * Nettoyage des libelles issus de Verif K7.
 *
 * L'export contient deux degats d'encodage distincts, qu'il ne faut pas
 * confondre :
 *
 *  - le mojibake REPARABLE : du texte UTF-8 relu comme du Latin-1 puis
 *    re-encode en UTF-8 ("comprimAcs"). L'information est intacte, seulement
 *    mal habillee : on peut la restaurer exactement.
 *  - la perte IRREVERSIBLE : les caracteres ont ete remplaces par "?" ou par
 *    le caractere de remplacement Unicode ("????"). L'original n'existe plus
 *    nulle part, aucun code ne peut l'inventer ; on se contente de signaler.
 */

const REMPLACEMENT_UNICODE = '�';

/**
 * Table inverse de Windows-1252 pour la plage 0x80-0x9F.
 *
 * C'est le detail qui decide de la reussite de la reparation. Le texte a ete
 * relu par le portail comme du Windows-1252, PAS comme du Latin-1 : dans
 * cette plage les deux encodages divergent completement. Sans cette table,
 * "Nutri-04-CÅ“ur" (ou l'octet 0x93 est devenu le guillemet U+201C) reste
 * irreparable, et l'apostrophe typographique "dâ€™extincteur" aussi.
 */
const OCTETS_WINDOWS_1252 = new Map<string, number>([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84],
  ['…', 0x85], ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88],
  ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c],
  ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92], ['“', 0x93],
  ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97],
  ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b],
  ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
]);

export type ResultatTexte = {
  valeur: string;
  mojibakeRepare: boolean;
  perteEncodage: boolean;
  espacesNormalises: boolean;
};

/** Octet d'origine d'un caractere, s'il peut provenir d'un octet unique. */
function versOctet(caractere: string): number | null {
  const code = caractere.codePointAt(0);
  if (code === undefined) return null;
  if (code <= 0xff) return code;
  return OCTETS_WINDOWS_1252.get(caractere) ?? null;
}

/** Nombre d'octets d'une sequence UTF-8 d'apres son octet de tete. */
function longueurSequence(octet: number): number | null {
  if (octet >= 0xc2 && octet <= 0xdf) return 2;
  if (octet >= 0xe0 && octet <= 0xef) return 3;
  if (octet >= 0xf0 && octet <= 0xf4) return 4;
  return null;
}

/**
 * Tente de lire, a partir de `debut`, une sequence UTF-8 deguisee en
 * caracteres Windows-1252. Renvoie null des que le moindre element ne colle
 * pas : mieux vaut laisser un caractere douteux intact que produire du bruit.
 */
function decoderSequence(texte: string, debut: number): { caractere: string; longueur: number } | null {
  const tete = versOctet(texte[debut] ?? '');
  if (tete === null) return null;

  const longueur = longueurSequence(tete);
  if (longueur === null || debut + longueur > texte.length) return null;

  const octets = [tete];
  for (let decalage = 1; decalage < longueur; decalage += 1) {
    const suite = versOctet(texte[debut + decalage] ?? '');
    if (suite === null || suite < 0x80 || suite > 0xbf) return null;
    octets.push(suite);
  }

  const decode = Buffer.from(octets).toString('utf8');
  if (decode.includes(REMPLACEMENT_UNICODE)) return null;

  return { caractere: decode, longueur };
}

/**
 * Defait un double encodage UTF-8, sequence par sequence.
 *
 * Le traitement est local et non global : une chaine peut etre partiellement
 * abimee ("decharge agreee ... COÂ²"), ou le "e" accentue est deja correct et
 * seul le "²" est deguise. Decoder la chaine entiere d'un bloc detruirait la
 * partie saine ; on ne touche donc qu'aux sequences qui se decodent vraiment.
 */
export function reparerMojibake(texte: string): { valeur: string; repare: boolean } {
  let resultat = '';
  let position = 0;
  let repare = false;

  while (position < texte.length) {
    const sequence = decoderSequence(texte, position);
    if (sequence) {
      resultat += sequence.caractere;
      position += sequence.longueur;
      repare = true;
    } else {
      resultat += texte[position];
      position += 1;
    }
  }

  return { valeur: resultat, repare };
}

/** Detecte une perte d'information que rien ne pourra restaurer. */
export function aPerteEncodage(texte: string): boolean {
  return texte.includes(REMPLACEMENT_UNICODE) || /\?{3,}/.test(texte);
}

/** Espaces insecables, tabulations, espaces multiples, bords. */
export function normaliserEspaces(texte: string): string {
  return texte.replace(/[\s ]+/g, ' ').trim();
}

/** Pipeline complet applique a chaque libelle importe. */
export function nettoyerLibelle(brut: unknown): ResultatTexte {
  const origine = String(brut ?? '');
  const { valeur: repare, repare: mojibakeRepare } = reparerMojibake(origine);
  const valeur = normaliserEspaces(repare);
  return {
    valeur,
    mojibakeRepare,
    perteEncodage: aPerteEncodage(valeur),
    espacesNormalises: valeur !== repare,
  };
}

/**
 * Forme normalisee servant a la recherche et au rapprochement de produits :
 * minuscules, sans accent, sans ponctuation parasite, espaces reduits.
 * C'est cette valeur qui alimentera l'index de recherche, pour qu'une saisie
 * "galerie photo" retrouve "galerie photo" accentue.
 */
export function normaliserPourRecherche(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
