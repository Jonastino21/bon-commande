import type { Bdd } from './connexion.js';
import { versBooleen } from './connexion.js';
import { normaliserPourRecherche } from '../domaine/texte.js';

/**
 * Recherche de produits a ajouter dans un document.
 *
 * Ce que l'utilisateur cherche, c'est un article a acheter. Ce que la base
 * contient, ce sont des TARIFS : "tel produit, chez tel fournisseur, a tel
 * prix". On interroge donc les tarifs, puis on les regroupe par produit pour
 * que l'ecran montre "ciment 50 kg — 4 fournisseurs" plutot que quatre lignes
 * identiques que l'utilisateur devrait comparer lui-meme.
 */

export type Offre = {
  tarifId: number;
  fournisseurCode: string | null;
  fournisseurQualite: string;
  prixCentimes: number | null;
  dateTarif: string | null;
  echelleIncertaine: boolean;
  codeChezTiers: string | null;
  /**
   * Faux pour un tarif marque "NA" dans Verif K7 (860 lignes sur 3 099).
   *
   * Ces tarifs sont montres, jamais masques : les cacher ferait disparaitre
   * 59 produits de la recherche, et l'utilisateur en conclurait que
   * l'application ne les connait pas alors qu'elle en a le prix. Ils sont
   * simplement releguees apres les tarifs courants et signales a l'ecran.
   */
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
  /** Vrai si au moins une offre attend un arbitrage d'echelle. */
  prixAVerifier: boolean;
  /** Vrai si aucun tarif courant n'existe : seuls des tarifs archives restent. */
  tousTarifsArchives: boolean;
};

/** Nombre de tarifs ramenes avant regroupement. */
const LIGNES_AVANT_REGROUPEMENT = 300;

/**
 * Transforme une saisie libre en expression FTS5.
 *
 * Chaque mot devient un prefixe entre guillemets : "cime"* trouve "ciment".
 * Les guillemets sont doubles pour neutraliser la saisie, et la ponctuation
 * est retiree en amont par la normalisation — sans quoi un "*" ou un ":"
 * tape par l'utilisateur serait interprete comme un operateur FTS et ferait
 * echouer la requete au lieu de chercher.
 */
export function construireRequeteFts(saisie: string): string | null {
  const mots = normaliserPourRecherche(saisie).split(' ').filter(Boolean);
  if (mots.length === 0) return null;
  return mots.map((mot) => `"${mot.replace(/"/g, '""')}"*`).join(' ');
}

type LigneResultat = {
  tarif_id: number;
  produit_id: number | null;
  designation_libre: string | null;
  prix_centimes: number | null;
  date_tarif: string | null;
  echelle_incertaine: number;
  tarif_actif: number;
  code_chez_tiers: string | null;
  source_produit_id: number | null;
  nom: string | null;
  code_produit_a: string | null;
  famille: string | null;
  unite: string | null;
  fournisseur_code: string | null;
  fournisseur_qualite: string | null;
};

const SELECTION = `
  select
    t.id                as tarif_id,
    t.produit_id        as produit_id,
    t.designation_libre as designation_libre,
    t.prix_centimes     as prix_centimes,
    t.date_tarif        as date_tarif,
    t.echelle_incertaine as echelle_incertaine,
    t.actif             as tarif_actif,
    t.code_chez_tiers   as code_chez_tiers,
    p.source_produit_id as source_produit_id,
    p.nom               as nom,
    p.code_produit_a    as code_produit_a,
    p.famille           as famille,
    p.unite             as unite,
    ti.code             as fournisseur_code,
    ti.qualite          as fournisseur_qualite
`;

function regrouper(lignes: readonly LigneResultat[], limite: number): ResultatRecherche[] {
  const groupes = new Map<string, ResultatRecherche>();

  for (const ligne of lignes) {
    // Les tarifs rattaches a un produit se regroupent sous ce produit ; les
    // lignes en texte libre restent chacune leur propre resultat, faute de
    // quoi les rapprocher les unes des autres.
    const cle = ligne.produit_id ? `produit:${ligne.produit_id}` : `tarif:${ligne.tarif_id}`;

    let groupe = groupes.get(cle);
    if (!groupe) {
      groupe = {
        cle,
        libelle: ligne.nom || ligne.designation_libre || '(sans libelle)',
        produitId: ligne.produit_id,
        sourceProduitId: ligne.source_produit_id,
        codeProduit: ligne.code_produit_a,
        famille: ligne.famille,
        unite: ligne.unite,
        offres: [],
        meilleurPrixCentimes: null,
        prixAVerifier: false,
        tousTarifsArchives: false,
      };
      groupes.set(cle, groupe);
    }

    groupe.offres.push({
      tarifId: ligne.tarif_id,
      fournisseurCode: ligne.fournisseur_code,
      fournisseurQualite: ligne.fournisseur_qualite ?? 'inconnue',
      prixCentimes: ligne.prix_centimes,
      dateTarif: ligne.date_tarif,
      echelleIncertaine: versBooleen(ligne.echelle_incertaine),
      codeChezTiers: ligne.code_chez_tiers,
      actif: versBooleen(ligne.tarif_actif),
    });
  }

  for (const groupe of groupes.values()) {
    // L'offre la moins chere en tete : c'est celle que l'ecran proposera par
    // defaut, et le gain de temps principal par rapport a l'ancien logiciel.
    groupe.offres.sort((a, b) => {
      // Un tarif courant passe toujours devant un tarif archive, meme moins
      // cher : proposer par defaut un prix perime serait un piege.
      if (a.actif !== b.actif) return a.actif ? -1 : 1;
      if (a.prixCentimes === null) return 1;
      if (b.prixCentimes === null) return -1;
      return a.prixCentimes - b.prixCentimes;
    });
    groupe.meilleurPrixCentimes = groupe.offres[0]?.prixCentimes ?? null;
    groupe.prixAVerifier = groupe.offres.some((offre) => offre.echelleIncertaine);
    groupe.tousTarifsArchives = groupe.offres.every((offre) => !offre.actif);
  }

  // Un article sans aucun prix ne peut pas etre ajoute a un document : il
  // reste visible, mais apres ceux qui sont utilisables.
  return [...groupes.values()]
    .sort((a, b) => {
      const aSansPrix = a.meilleurPrixCentimes === null ? 1 : 0;
      const bSansPrix = b.meilleurPrixCentimes === null ? 1 : 0;
      return aSansPrix - bSansPrix;
    })
    .slice(0, limite);
}

export function rechercher(bdd: Bdd, saisie: string, limite = 20): ResultatRecherche[] {
  const requete = construireRequeteFts(saisie);
  if (!requete) return [];

  let lignes: LigneResultat[];
  try {
    lignes = bdd
      .prepare(
        `${SELECTION}
         from tarif_recherche
         join tarif t on t.id = tarif_recherche.rowid
         left join produit p on p.id = t.produit_id
         left join tiers ti on ti.id = t.tiers_id
         where tarif_recherche match ?
           and (p.id is null or p.actif = 1)
         order by rank
         limit ?`,
      )
      .all(requete, LIGNES_AVANT_REGROUPEMENT) as unknown as LigneResultat[];
  } catch {
    // Une expression FTS refusee ne doit jamais remonter comme une erreur a
    // l'utilisateur : on retombe sur une recherche simple.
    lignes = [];
  }

  if (lignes.length === 0) {
    lignes = rechercheDeSecours(bdd, saisie);
  }

  return regrouper(lignes, limite);
}

/**
 * Filet de securite quand l'index plein texte ne trouve rien : recherche par
 * sous-chaine sur les libelles normalises. Plus lente, mais elle rattrape les
 * cas ou le mot cherche est au milieu d'un mot ("prise" dans "multiprise").
 */
function rechercheDeSecours(bdd: Bdd, saisie: string): LigneResultat[] {
  const motif = `%${normaliserPourRecherche(saisie)}%`;
  if (motif === '%%') return [];

  return bdd
    .prepare(
      `${SELECTION}
       from tarif t
       left join produit p on p.id = t.produit_id
       left join tiers ti on ti.id = t.tiers_id
       where (p.id is null or p.actif = 1)
         and (p.nom_normalise like ? or t.designation_normalisee like ?)
       limit ?`,
    )
    .all(motif, motif, LIGNES_AVANT_REGROUPEMENT) as unknown as LigneResultat[];
}

export type FiltresCatalogue = {
  recherche?: string;
  famille?: string;
  inclureInactifs?: boolean;
  avecPrixSeulement?: boolean;
  page?: number;
  parPage?: number;
};

export type PageCatalogue = {
  resultats: ResultatRecherche[];
  total: number;
  page: number;
  parPage: number;
};

export function listerCatalogue(bdd: Bdd, filtres: FiltresCatalogue = {}): PageCatalogue {
  const page = Math.max(1, filtres.page ?? 1);
  const parPage = Math.min(200, Math.max(1, filtres.parPage ?? 50));

  const conditions: string[] = [];
  const parametres: Array<string | number> = [];

  if (!filtres.inclureInactifs) conditions.push('p.actif = 1');
  if (filtres.famille) {
    conditions.push('p.famille = ?');
    parametres.push(filtres.famille);
  }
  if (filtres.recherche) {
    conditions.push('p.nom_normalise like ?');
    parametres.push(`%${normaliserPourRecherche(filtres.recherche)}%`);
  }

  const ou = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';

  const total = Number(
    (bdd.prepare(`select count(*) as n from produit p ${ou}`).get(...parametres) as { n: number }).n,
  );

  const identifiants = bdd
    .prepare(`select p.id from produit p ${ou} order by p.nom collate nocase limit ? offset ?`)
    .all(...parametres, parPage, (page - 1) * parPage) as unknown as Array<{ id: number }>;

  if (identifiants.length === 0) {
    return { resultats: [], total, page, parPage };
  }

  const marqueurs = identifiants.map(() => '?').join(', ');
  const lignes = bdd
    .prepare(
      `${SELECTION}
       from tarif t
       join produit p on p.id = t.produit_id
       left join tiers ti on ti.id = t.tiers_id
       where p.id in (${marqueurs})`,
    )
    .all(...identifiants.map((ligne) => ligne.id)) as unknown as LigneResultat[];

  const resultats = regrouper(lignes, parPage);

  // Un produit sans aucun tarif n'apparaitrait pas dans la jointure ci-dessus :
  // on le reinjecte, sinon le catalogue mentirait sur son propre contenu.
  const vus = new Set(resultats.map((resultat) => resultat.produitId));
  const manquants = identifiants.filter((ligne) => !vus.has(ligne.id));
  if (manquants.length > 0) {
    const marqueursManquants = manquants.map(() => '?').join(', ');
    const produits = bdd
      .prepare(
        `select id, source_produit_id, nom, code_produit_a, famille, unite
         from produit where id in (${marqueursManquants})`,
      )
      .all(...manquants.map((ligne) => ligne.id)) as unknown as Array<{
      id: number;
      source_produit_id: number;
      nom: string;
      code_produit_a: string | null;
      famille: string | null;
      unite: string | null;
    }>;

    for (const produit of produits) {
      resultats.push({
        cle: `produit:${produit.id}`,
        libelle: produit.nom,
        produitId: produit.id,
        sourceProduitId: produit.source_produit_id,
        codeProduit: produit.code_produit_a,
        famille: produit.famille,
        unite: produit.unite,
        offres: [],
        meilleurPrixCentimes: null,
        prixAVerifier: false,
        tousTarifsArchives: false,
      });
    }
  }

  resultats.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
  return { resultats, total, page, parPage };
}

export function listerFamilles(bdd: Bdd): Array<{ famille: string; nombre: number }> {
  return bdd
    .prepare(
      `select famille, count(*) as nombre
       from produit
       where famille is not null and famille <> '' and actif = 1
       group by famille
       order by nombre desc`,
    )
    .all() as unknown as Array<{ famille: string; nombre: number }>;
}
