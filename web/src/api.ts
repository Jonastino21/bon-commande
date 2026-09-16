/**
 * Acces a l'API.
 *
 * Toutes les erreurs remontent sous forme d'un message en francais, prevu
 * pour etre affiche tel quel. Aucun ecran ne doit avoir a interpreter un code
 * HTTP ni une exception technique.
 */

export type Offre = {
  tarifId: number;
  fournisseurCode: string | null;
  fournisseurQualite: string;
  prixCentimes: number | null;
  dateTarif: string | null;
  echelleIncertaine: boolean;
  codeChezTiers: string | null;
  actif: boolean;
};

export type ResultatRecherche = {
  cle: string;
  libelle: string;
  produitId: number | null;
  sourceProduitId: number | null;
  codeProduit: string | null;
  famille: string | null;
  unite: string | null;
  offres: Offre[];
  meilleurPrixCentimes: number | null;
  prixAVerifier: boolean;
  tousTarifsArchives: boolean;
};

/** L'application ne produit que des bons de commande. */
export type TypeDocument = 'bon_commande';
export type StatutDocument = 'brouillon' | 'finalise' | 'annule';

export type LigneDocument = {
  id?: number;
  numeroLigne?: number;
  tarifId: number | null;
  produitId: number | null;
  nomProduit: string;
  reference: string | null;
  fournisseur: string | null;
  unite: string | null;
  prixCatalogueCentimes: number | null;
  prixUnitaireCentimes: number;
  quantiteMilliemes: number;
  prixModifieManuellement?: boolean;
  sousTotalCentimes?: number;
};

export type DocumentComplet = {
  id: number;
  numero: string;
  type: TypeDocument;
  dateDocument: string;
  statut: StatutDocument;
  tiersLibelle: string | null;
  notes: string | null;
  devise: string;
  totalCentimes: number;
  nombreLignes: number;
  creeLe: string;
  modifieLe: string;
  lignes: LigneDocument[];
};

export type EnteteDocument = Omit<DocumentComplet, 'lignes'>;

export type Statistiques = {
  produitsActifs: number;
  tarifsAvecPrix: number;
  prixAVerifier: number;
  documentsBrouillon: number;
  documentsFinalises: number;
  derniereSynchronisation: string | null;
};

export class ErreurApi extends Error {}

async function appeler<T>(url: string, options?: RequestInit): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
  } catch {
    throw new ErreurApi(
      "Impossible de joindre le serveur. Verifiez que l'application est bien demarree.",
    );
  }

  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as { erreur?: string } | null;
    throw new ErreurApi(corps?.erreur ?? "L'operation a echoue.");
  }

  return (await reponse.json()) as T;
}

export const api = {
  statistiques: () => appeler<Statistiques>('/api/statistiques'),

  rechercher: (saisie: string, limite = 12) =>
    appeler<{ resultats: ResultatRecherche[] }>(
      `/api/recherche?q=${encodeURIComponent(saisie)}&limite=${limite}`,
    ).then((reponse) => reponse.resultats),

  catalogue: (parametres: { recherche?: string; famille?: string; page?: number; parPage?: number }) => {
    const requete = new URLSearchParams();
    for (const [cle, valeur] of Object.entries(parametres)) {
      if (valeur !== undefined && valeur !== '') requete.set(cle, String(valeur));
    }
    return appeler<{
      resultats: ResultatRecherche[];
      total: number;
      page: number;
      parPage: number;
    }>(`/api/catalogue?${requete.toString()}`);
  },

  familles: () =>
    appeler<{ familles: Array<{ famille: string; nombre: number }> }>('/api/familles').then(
      (reponse) => reponse.familles,
    ),

  documents: (parametres: { recherche?: string; statut?: string } = {}) => {
    const requete = new URLSearchParams();
    for (const [cle, valeur] of Object.entries(parametres)) {
      if (valeur) requete.set(cle, valeur);
    }
    return appeler<{ documents: EnteteDocument[] }>(`/api/documents?${requete.toString()}`).then(
      (reponse) => reponse.documents,
    );
  },

  document: (id: number) => appeler<DocumentComplet>(`/api/documents/${id}`),

  creerDocument: (corps: unknown) =>
    appeler<DocumentComplet>('/api/documents', { method: 'POST', body: JSON.stringify(corps) }),

  modifierDocument: (id: number, corps: unknown) =>
    appeler<DocumentComplet>(`/api/documents/${id}`, { method: 'PUT', body: JSON.stringify(corps) }),

  changerStatut: (id: number, statut: StatutDocument) =>
    appeler<DocumentComplet>(`/api/documents/${id}/statut`, {
      method: 'POST',
      body: JSON.stringify({ statut }),
    }),
};
