/**
 * Montants monetaires.
 *
 * Regle absolue du projet : aucun montant ne transite jamais sous forme de
 * nombre a virgule flottante. Tout est stocke et calcule en ENTIERS de
 * centimes d'ariary. L'export Verif K7 contient des valeurs a deux decimales
 * (ex. "28166.67"), c'est donc le centime qui est la plus petite unite utile.
 *
 * Le piege classique que ce module evite : parseFloat("0.29") * 100 vaut
 * 28.999999999999996 en IEEE 754. Tronque, cela fait 28 centimes au lieu de
 * 29. Idem pour "1.15" (114), "4.35" (434), "8.20" (819).
 *
 * Attention en relisant ce module : la majorite des valeurs passent sans
 * incident ("28166.67" * 100 vaut exactement 2816667). Un test au hasard
 * donne donc l'impression que cette precaution ne sert a rien. Elle sert.
 * On decoupe la chaine au lieu de multiplier un flottant.
 */

/** Un montant en centimes d'ariary. 100 centimes = 1 Ar. */
export type Centimes = number;

export const CENTIMES_PAR_ARIARY = 100;

/**
 * Seuils de detection de l'echelle de saisie (voir analyse du fichier KA) :
 * une partie des lignes a ete saisie en milliers d'ariary ("8.50" = 8 500 Ar).
 * La distribution des prix est continue, aucun seuil ne separe proprement les
 * deux echelles ; ces bornes delimitent donc seulement ce qui est certain, le
 * reste part en arbitrage humain.
 */
export const SEUIL_MILLIERS_CERTAIN_ARIARY = 100;
export const SEUIL_ARIARY_CERTAIN = 3000;

export type EchelleSaisie =
  | 'milliers_certain'
  | 'a_arbitrer'
  | 'ariary_certain';

export type ResultatMontant =
  | { ok: true; centimes: Centimes; decimalesTronquees: boolean }
  | { ok: false; raison: RaisonMontantInvalide; brut: string };

export type RaisonMontantInvalide =
  | 'vide'
  | 'non_numerique'
  | 'negatif'
  | 'hors_limites';

/** Au-dela, on considere que la valeur est aberrante plutot que reelle. */
const PLAFOND_ARIARY = 1_000_000_000;

/**
 * Convertit une valeur brute de l'export ("34400.00", "8,50", 1500) en
 * centimes entiers, sans jamais passer par une multiplication flottante.
 */
export function parseMontant(brut: unknown): ResultatMontant {
  const texte = String(brut ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (texte === '') return { ok: false, raison: 'vide', brut: String(brut ?? '') };

  if (!/^-?\d+(\.\d+)?$/.test(texte)) {
    return { ok: false, raison: 'non_numerique', brut: texte };
  }
  if (texte.startsWith('-')) {
    return { ok: false, raison: 'negatif', brut: texte };
  }

  const [partieEntiere = '0', partieDecimale = ''] = texte.split('.');

  // On garde deux decimales. Au-dela, on tronque en le signalant : arrondir
  // silencieusement un prix fournisseur serait une alteration invisible.
  const deuxDecimales = partieDecimale.slice(0, 2).padEnd(2, '0');
  const decimalesTronquees = partieDecimale.length > 2;

  const centimes = Number(partieEntiere) * CENTIMES_PAR_ARIARY + Number(deuxDecimales);
  if (!Number.isSafeInteger(centimes) || centimes > PLAFOND_ARIARY * CENTIMES_PAR_ARIARY) {
    return { ok: false, raison: 'hors_limites', brut: texte };
  }

  return { ok: true, centimes, decimalesTronquees };
}

/** Classe un montant selon l'echelle de saisie dont il releve probablement. */
export function classerEchelle(centimes: Centimes): EchelleSaisie {
  const ariary = centimes / CENTIMES_PAR_ARIARY;
  if (ariary < SEUIL_MILLIERS_CERTAIN_ARIARY) return 'milliers_certain';
  if (ariary < SEUIL_ARIARY_CERTAIN) return 'a_arbitrer';
  return 'ariary_certain';
}

/** Applique la correction d'echelle "saisi en milliers d'ariary". */
export function corrigerMilliers(centimes: Centimes): Centimes {
  return centimes * 1000;
}

/**
 * Sous-total d'une ligne de document.
 * La quantite peut etre decimale (kg, litre, metre) : on la traite en
 * milliemes entiers pour ne pas reintroduire de flottant dans le calcul.
 */
export const MILLIEMES_PAR_UNITE = 1000;

export function quantiteEnMilliemes(quantite: number): number {
  return Math.round(quantite * MILLIEMES_PAR_UNITE);
}

export function sousTotal(prixUnitaireCentimes: Centimes, quantiteMilliemes: number): Centimes {
  return Math.round((prixUnitaireCentimes * quantiteMilliemes) / MILLIEMES_PAR_UNITE);
}

export function totalGeneral(sousTotaux: readonly Centimes[]): Centimes {
  return sousTotaux.reduce((somme, valeur) => somme + valeur, 0);
}

/**
 * Groupement par milliers avec une espace ordinaire.
 *
 * Intl.NumberFormat('fr-FR') est volontairement ecarte : selon la version
 * d'ICU il produit une espace insecable (U+00A0) ou fine insecable (U+202F).
 * Ces caracteres cassent les exports CSV, s'affichent en carre dans certains
 * PDF, et rendraient les tests dependants de la machine. Le groupement manuel
 * donne le meme rendu partout.
 */
function grouperMilliers(entier: number): string {
  return String(entier).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Affichage francais : "1 234 567,89 Ar".
 * La partie entiere et la partie decimale sont formatees separement pour que
 * l'affichage reste exact meme sur les gros montants : reconstruire un
 * flottant "1234567.89" juste pour l'afficher rouvrirait la porte que
 * parseMontant a fermee.
 */
export function formaterAriary(centimes: Centimes, devise = 'Ar'): string {
  const signe = centimes < 0 ? '-' : '';
  const absolu = Math.abs(centimes);
  const entier = Math.floor(absolu / CENTIMES_PAR_ARIARY);
  const reste = absolu % CENTIMES_PAR_ARIARY;
  return `${signe}${grouperMilliers(entier)},${String(reste).padStart(2, '0')} ${devise}`;
}
