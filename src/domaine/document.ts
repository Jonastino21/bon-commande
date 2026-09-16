/**
 * Regles de coherence d'un bon de commande.
 *
 * Un bon de commande s'adresse a UN fournisseur : c'est lui qui le recoit et
 * qui l'honore. Rien n'empeche techniquement d'y melanger plusieurs
 * fournisseurs, et l'application ne l'interdit pas — il arrive qu'on prepare
 * un brouillon avant de le scinder. Mais elle doit le signaler, parce qu'un
 * bon envoye a un fournisseur avec des lignes qui ne le concernent pas revient
 * en litige.
 */

export type LignePourControle = { fournisseur: string | null };

/** Fournisseurs reellement presents dans les lignes, sans doublon ni vide. */
export function fournisseursDistincts(lignes: readonly LignePourControle[]): string[] {
  const vus = new Set<string>();
  for (const ligne of lignes) {
    const fournisseur = ligne.fournisseur?.trim();
    if (fournisseur) vus.add(fournisseur);
  }
  return [...vus];
}

/** Vrai quand le bon porte des lignes de plusieurs fournisseurs differents. */
export function melangeFournisseurs(lignes: readonly LignePourControle[]): boolean {
  return fournisseursDistincts(lignes).length > 1;
}

/**
 * Fournisseur a inscrire dans l'en-tete du bon.
 *
 * On ne remplit que si l'en-tete est vide : une valeur saisie a la main n'est
 * jamais ecrasee. C'est la premiere ligne ajoutee qui decide, ce qui couvre le
 * cas courant sans jamais surprendre l'utilisateur en changeant sous ses yeux
 * un champ qu'il vient de remplir.
 */
export function fournisseurAProposer(
  enteteActuelle: string,
  lignes: readonly LignePourControle[],
  fournisseurAjoute: string | null,
): string | null {
  if (enteteActuelle.trim() !== '') return null;
  if (lignes.length > 0) return null;
  const propose = fournisseurAjoute?.trim();
  return propose ? propose : null;
}
