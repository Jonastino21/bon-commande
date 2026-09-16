/**
 * Les dates de l'export sont au format AAMMJJ ("260902" = 2 septembre 2026).
 * Le siecle n'est pas transmis : les valeurs observees vont de 230324 a
 * 260902, on prefixe donc par 20. Une date posterieure a aujourd'hui est
 * refusee plutot que passee sous silence : sur ce fichier elle signalerait
 * une saisie fautive, pas un tarif a venir.
 */

export type ResultatDate =
  | { ok: true; iso: string }
  | { ok: false; raison: 'vide' | 'format' | 'invalide' | 'future'; brut: string };

const UN_JOUR_MS = 86_400_000;

export function parseDateAAMMJJ(brut: unknown, aujourdhui = new Date()): ResultatDate {
  const texte = String(brut ?? '').trim();
  if (texte === '') return { ok: false, raison: 'vide', brut: texte };
  if (!/^\d{6}$/.test(texte)) return { ok: false, raison: 'format', brut: texte };

  const annee = 2000 + Number(texte.slice(0, 2));
  const mois = Number(texte.slice(2, 4));
  const jour = Number(texte.slice(4, 6));

  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) {
    return { ok: false, raison: 'invalide', brut: texte };
  }

  const date = new Date(Date.UTC(annee, mois - 1, jour));
  const coherente =
    date.getUTCFullYear() === annee &&
    date.getUTCMonth() === mois - 1 &&
    date.getUTCDate() === jour;

  if (!coherente) return { ok: false, raison: 'invalide', brut: texte };

  if (date.getTime() > aujourdhui.getTime() + UN_JOUR_MS) {
    return { ok: false, raison: 'future', brut: texte };
  }

  return { ok: true, iso: date.toISOString().slice(0, 10) };
}
