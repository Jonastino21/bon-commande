import type { Bdd } from './connexion.js';
import { enTransaction, maintenant, versBooleen, versEntier } from './connexion.js';
import { sousTotal, totalGeneral } from '../domaine/monnaie.js';

/**
 * Bons de commande.
 *
 * Deux regles gouvernent ce module :
 *
 * 1. Les montants sont TOUJOURS recalcules ici, jamais repris de ce qu'envoie
 *    le navigateur. L'ecran affiche un total pour informer l'utilisateur ; le
 *    total qui fait foi est celui que le serveur recalcule a l'enregistrement.
 *
 * 2. Chaque ligne conserve une copie du nom, de la reference, du fournisseur
 *    et du prix au moment de l'ajout. Un document relu dans deux ans doit
 *    afficher ce qui a ete reellement commande, pas l'etat actuel du
 *    catalogue.
 */

/**
 * L'application ne produit que des bons de commande.
 *
 * Le champ `type` est conserve en base bien qu'il n'ait qu'une valeur : le
 * jour ou un devis ou une vente devient necessaire, il suffira d'ajouter une
 * entree ici, sans migration ni reprise des documents existants. Le compteur
 * de numeros est deja segmente par type, donc pret pour ce cas.
 */
export type TypeDocument = 'bon_commande';
export type StatutDocument = 'brouillon' | 'finalise' | 'annule';

export const TYPE_PAR_DEFAUT: TypeDocument = 'bon_commande';
export const TYPES_DOCUMENT: readonly TypeDocument[] = ['bon_commande'];

const PREFIXES: Record<TypeDocument, string> = {
  bon_commande: 'BON',
};

export type LigneSaisie = {
  tarifId: number | null;
  produitId: number | null;
  nomProduit: string;
  reference: string | null;
  fournisseur: string | null;
  unite: string | null;
  prixCatalogueCentimes: number | null;
  prixUnitaireCentimes: number;
  quantiteMilliemes: number;
};

export type LigneEnregistree = LigneSaisie & {
  id: number;
  numeroLigne: number;
  prixModifieManuellement: boolean;
  sousTotalCentimes: number;
};

export type EnteteDocument = {
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
};

export type DocumentComplet = EnteteDocument & { lignes: LigneEnregistree[] };

/**
 * Numero sequentiel par type et par annee : BON-2026-0001.
 * Le compteur vit en base et est incremente dans la meme transaction que
 * l'insertion, ce qui empeche deux postes d'obtenir le meme numero.
 */
function prochainNumero(bdd: Bdd, type: TypeDocument, annee: number): string {
  bdd.prepare(
    `insert into compteur_document (type, annee, valeur) values (?, ?, 0)
     on conflict (type, annee) do nothing`,
  ).run(type, annee);

  bdd.prepare('update compteur_document set valeur = valeur + 1 where type = ? and annee = ?').run(
    type,
    annee,
  );

  const { valeur } = bdd
    .prepare('select valeur from compteur_document where type = ? and annee = ?')
    .get(type, annee) as { valeur: number };

  return `${PREFIXES[type]}-${annee}-${String(valeur).padStart(4, '0')}`;
}

export type EntreeDocument = {
  type?: TypeDocument;
  dateDocument: string;
  tiersLibelle?: string | null;
  notes?: string | null;
  statut?: StatutDocument;
  lignes: LigneSaisie[];
};

function calculerLignes(lignes: readonly LigneSaisie[]) {
  return lignes.map((ligne, index) => {
    const sousTotalCentimes = sousTotal(ligne.prixUnitaireCentimes, ligne.quantiteMilliemes);
    return {
      ...ligne,
      numeroLigne: index + 1,
      sousTotalCentimes,
      // Le prix est dit "modifie" des qu'il s'ecarte du prix catalogue copie
      // a l'ajout. On le deduit plutot que de croire le navigateur sur parole.
      prixModifieManuellement:
        ligne.prixCatalogueCentimes !== null &&
        ligne.prixCatalogueCentimes !== ligne.prixUnitaireCentimes,
    };
  });
}

export function creerDocument(bdd: Bdd, entree: EntreeDocument): DocumentComplet {
  const horodatage = maintenant();
  const annee = Number(entree.dateDocument.slice(0, 4)) || new Date().getFullYear();

  return enTransaction(bdd, () => {
    const type = entree.type ?? TYPE_PAR_DEFAUT;
    const numero = prochainNumero(bdd, type, annee);
    const calculees = calculerLignes(entree.lignes);
    const total = totalGeneral(calculees.map((ligne) => ligne.sousTotalCentimes));

    const resultat = bdd
      .prepare(
        `insert into document (numero, type, date_document, statut, tiers_libelle, notes,
                               devise, total_centimes, cree_le, modifie_le)
         values (?, ?, ?, ?, ?, ?, 'MGA', ?, ?, ?)`,
      )
      .run(
        numero,
        type,
        entree.dateDocument,
        entree.statut ?? 'brouillon',
        entree.tiersLibelle ?? null,
        entree.notes ?? null,
        total,
        horodatage,
        horodatage,
      );

    const documentId = Number(resultat.lastInsertRowid);
    insererLignes(bdd, documentId, calculees, horodatage);

    return obtenirDocument(bdd, documentId)!;
  });
}

function insererLignes(
  bdd: Bdd,
  documentId: number,
  lignes: ReturnType<typeof calculerLignes>,
  horodatage: string,
): void {
  const inserer = bdd.prepare(
    `insert into ligne_document (
       document_id, numero_ligne, produit_id, tarif_id, nom_produit_snapshot,
       reference_snapshot, fournisseur_snapshot, unite_snapshot,
       prix_catalogue_snapshot_centimes, prix_unitaire_centimes,
       prix_modifie_manuellement, quantite_milliemes, sous_total_centimes, cree_le
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const ligne of lignes) {
    inserer.run(
      documentId,
      ligne.numeroLigne,
      ligne.produitId,
      ligne.tarifId,
      ligne.nomProduit,
      ligne.reference,
      ligne.fournisseur,
      ligne.unite,
      ligne.prixCatalogueCentimes,
      ligne.prixUnitaireCentimes,
      versEntier(ligne.prixModifieManuellement),
      ligne.quantiteMilliemes,
      ligne.sousTotalCentimes,
      horodatage,
    );
  }
}

export function mettreAJourDocument(
  bdd: Bdd,
  documentId: number,
  entree: EntreeDocument,
): DocumentComplet | null {
  const horodatage = maintenant();

  return enTransaction(bdd, () => {
    const existant = bdd.prepare('select statut from document where id = ?').get(documentId) as
      | { statut: StatutDocument }
      | undefined;
    if (!existant) return null;

    // Un document finalise est fige : c'est la contrepartie de sa valeur de
    // preuve. Pour le corriger, on l'annule et on en cree un nouveau.
    if (existant.statut === 'finalise' && entree.statut !== 'annule') {
      throw new Error('Ce document est finalise : il ne peut plus etre modifie.');
    }

    const calculees = calculerLignes(entree.lignes);
    const total = totalGeneral(calculees.map((ligne) => ligne.sousTotalCentimes));

    bdd.prepare(
      `update document
       set date_document = ?, statut = ?, tiers_libelle = ?, notes = ?,
           total_centimes = ?, modifie_le = ?
       where id = ?`,
    ).run(
      entree.dateDocument,
      entree.statut ?? 'brouillon',
      entree.tiersLibelle ?? null,
      entree.notes ?? null,
      total,
      horodatage,
      documentId,
    );

    bdd.prepare('delete from ligne_document where document_id = ?').run(documentId);
    insererLignes(bdd, documentId, calculees, horodatage);

    return obtenirDocument(bdd, documentId);
  });
}

export function changerStatut(
  bdd: Bdd,
  documentId: number,
  statut: StatutDocument,
): DocumentComplet | null {
  bdd.prepare('update document set statut = ?, modifie_le = ? where id = ?').run(
    statut,
    maintenant(),
    documentId,
  );
  return obtenirDocument(bdd, documentId);
}

type LigneDocumentBdd = {
  id: number;
  numero_ligne: number;
  produit_id: number | null;
  tarif_id: number | null;
  nom_produit_snapshot: string;
  reference_snapshot: string | null;
  fournisseur_snapshot: string | null;
  unite_snapshot: string | null;
  prix_catalogue_snapshot_centimes: number | null;
  prix_unitaire_centimes: number;
  prix_modifie_manuellement: number;
  quantite_milliemes: number;
  sous_total_centimes: number;
};

type DocumentBdd = {
  id: number;
  numero: string;
  type: TypeDocument;
  date_document: string;
  statut: StatutDocument;
  tiers_libelle: string | null;
  notes: string | null;
  devise: string;
  total_centimes: number;
  cree_le: string;
  modifie_le: string;
};

export function obtenirDocument(bdd: Bdd, documentId: number): DocumentComplet | null {
  const entete = bdd.prepare('select * from document where id = ?').get(documentId) as
    | DocumentBdd
    | undefined;
  if (!entete) return null;

  const lignes = bdd
    .prepare('select * from ligne_document where document_id = ? order by numero_ligne')
    .all(documentId) as unknown as LigneDocumentBdd[];

  return {
    id: entete.id,
    numero: entete.numero,
    type: entete.type,
    dateDocument: entete.date_document,
    statut: entete.statut,
    tiersLibelle: entete.tiers_libelle,
    notes: entete.notes,
    devise: entete.devise,
    totalCentimes: entete.total_centimes,
    nombreLignes: lignes.length,
    creeLe: entete.cree_le,
    modifieLe: entete.modifie_le,
    lignes: lignes.map((ligne) => ({
      id: ligne.id,
      numeroLigne: ligne.numero_ligne,
      produitId: ligne.produit_id,
      tarifId: ligne.tarif_id,
      nomProduit: ligne.nom_produit_snapshot,
      reference: ligne.reference_snapshot,
      fournisseur: ligne.fournisseur_snapshot,
      unite: ligne.unite_snapshot,
      prixCatalogueCentimes: ligne.prix_catalogue_snapshot_centimes,
      prixUnitaireCentimes: ligne.prix_unitaire_centimes,
      prixModifieManuellement: versBooleen(ligne.prix_modifie_manuellement),
      quantiteMilliemes: ligne.quantite_milliemes,
      sousTotalCentimes: ligne.sous_total_centimes,
    })),
  };
}

export type FiltresDocuments = {
  recherche?: string;
  type?: TypeDocument;
  statut?: StatutDocument;
  limite?: number;
};

export function listerDocuments(bdd: Bdd, filtres: FiltresDocuments = {}): EnteteDocument[] {
  const conditions: string[] = [];
  const parametres: Array<string | number> = [];

  if (filtres.type) {
    conditions.push('d.type = ?');
    parametres.push(filtres.type);
  }
  if (filtres.statut) {
    conditions.push('d.statut = ?');
    parametres.push(filtres.statut);
  }
  if (filtres.recherche) {
    // La recherche porte aussi sur les produits contenus : retrouver un
    // ancien bon par un article dont on se souvient est le cas d'usage le
    // plus frequent dans l'historique.
    conditions.push(`(
      d.numero like ?1 or d.tiers_libelle like ?1 or d.notes like ?1
      or exists (
        select 1 from ligne_document l
        where l.document_id = d.id and l.nom_produit_snapshot like ?1
      )
    )`);
    parametres.push(`%${filtres.recherche}%`);
  }

  const ou = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
  const limite = Math.min(500, Math.max(1, filtres.limite ?? 100));

  const lignes = bdd
    .prepare(
      `select d.*, (select count(*) from ligne_document l where l.document_id = d.id) as nombre_lignes
       from document d
       ${ou}
       order by d.cree_le desc
       limit ${limite}`,
    )
    .all(...parametres) as unknown as Array<DocumentBdd & { nombre_lignes: number }>;

  return lignes.map((entete) => ({
    id: entete.id,
    numero: entete.numero,
    type: entete.type,
    dateDocument: entete.date_document,
    statut: entete.statut,
    tiersLibelle: entete.tiers_libelle,
    notes: entete.notes,
    devise: entete.devise,
    totalCentimes: entete.total_centimes,
    nombreLignes: entete.nombre_lignes,
    creeLe: entete.cree_le,
    modifieLe: entete.modifie_le,
  }));
}

export type StatistiquesTableauBord = {
  produitsActifs: number;
  tarifsAvecPrix: number;
  prixAVerifier: number;
  documentsBrouillon: number;
  documentsFinalises: number;
  derniereSynchronisation: string | null;
};

export function statistiques(bdd: Bdd): StatistiquesTableauBord {
  const un = (sql: string): number =>
    Number((bdd.prepare(sql).get() as { n: number } | undefined)?.n ?? 0);

  const derniere = bdd
    .prepare('select date_import from import_catalogue order by id desc limit 1')
    .get() as { date_import: string } | undefined;

  return {
    produitsActifs: un('select count(*) as n from produit where actif = 1'),
    tarifsAvecPrix: un('select count(*) as n from tarif where prix_centimes is not null'),
    prixAVerifier: un('select count(*) as n from tarif where echelle_incertaine = 1'),
    documentsBrouillon: un("select count(*) as n from document where statut = 'brouillon'"),
    documentsFinalises: un("select count(*) as n from document where statut = 'finalise'"),
    derniereSynchronisation: derniere?.date_import ?? null,
  };
}
