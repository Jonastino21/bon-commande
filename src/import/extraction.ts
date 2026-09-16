import type { LigneBrute } from './schema.js';
import { nettoyerLibelle, normaliserPourRecherche } from '../domaine/texte.js';
import { parseDateAAMMJJ } from '../domaine/dates.js';
import {
  classerEchelle,
  corrigerMilliers,
  parseMontant,
  type Centimes,
  type EchelleSaisie,
} from '../domaine/monnaie.js';

/**
 * Transformation des lignes brutes du module 21 en entites metier.
 *
 * Une ligne de l'export = un TARIF (un prix negocie entre un tiers et un
 * produit). Le produit et le tiers n'y figurent que par reference : on les
 * reconstitue par agregation, en gardant a l'esprit que ce module n'est pas
 * leur source de verite.
 *
 * Aucune donnee n'est jetee en silence. Tout ce qui est corrige, ignore ou
 * douteux ressort dans `anomalies`, avec de quoi retrouver la ligne d'origine.
 */

/** Noms des colonnes du module 21, isoles ici pour rester lisibles. */
export const CHAMPS = {
  ligneId: 'id',
  produitId: 'assoc__produit__id',
  produitNom: 'assoc__produit__327',
  produitCodeA: 'assoc__produit__762',
  produitCodeN: 'assoc__produit__3289',
  tiersId: 'assoc__client__id',
  tiersCode: 'assoc__client__326',
  tiersQualite: 'assoc__client__3434',
  designationLibre: 'designActeur',
  codeChezTiers: 'codeActeur',
  prixPropose: 'tarifProp',
  remise: 'remise',
  prixApplique: 'tarifApp',
  prixFinal: 'tarifFinale',
  famille: 'famille',
  etat: 'etat',
  date: 'date',
  societe: 'societeId',
  image: 'Image',
} as const;

export type QualiteTiers = 'fournisseur' | 'client' | 'prospect' | 'inconnue';

export type Produit = {
  sourceProduitId: number;
  nom: string;
  nomNormalise: string;
  codeProduitA: string | null;
  codeProduitN: string | null;
  famille: string | null;
  aPhoto: boolean;
  nombreTarifs: number;
};

export type Tiers = {
  sourceTiersId: number;
  code: string | null;
  qualite: QualiteTiers;
  qualiteBrute: string | null;
  nombreTarifs: number;
};

export type Tarif = {
  sourceLigneId: number;
  sourceProduitId: number | null;
  sourceTiersId: number | null;
  /** Libelle saisi par le tiers, seul identifiant des lignes non rattachees. */
  designationLibre: string | null;
  designationNormalisee: string | null;
  /** Reference du produit chez ce tiers (colonne "F code"). */
  codeChezTiers: string | null;
  prixCentimes: Centimes | null;
  /** Valeur telle que lue, avant toute correction d'echelle. */
  prixLuCentimes: Centimes | null;
  echelle: EchelleSaisie;
  echelleCorrigee: boolean;
  /** Vrai tant qu'un humain n'a pas tranche l'echelle de cette ligne. */
  echelleIncertaine: boolean;
  dateTarif: string | null;
  etatBrut: string | null;
  actif: boolean;
  societe: string | null;
};

export type TypeAnomalie =
  | 'ligne_sans_identifiant'
  | 'ligne_totalement_vide'
  | 'tarif_sans_prix'
  | 'tarif_sans_produit_lie'
  | 'prix_non_numerique'
  | 'prix_hors_limites'
  | 'prix_decimales_tronquees'
  | 'echelle_corrigee_automatiquement'
  | 'echelle_a_arbitrer'
  | 'libelle_mojibake_repare'
  | 'libelle_perte_encodage'
  | 'date_illisible'
  | 'doublon_ligne_source'
  | 'doublon_tiers_produit'
  | 'produit_noms_divergents'
  | 'code_produit_partage'
  | 'nom_partage_par_plusieurs_produits';

export type Anomalie = {
  type: TypeAnomalie;
  ligneId: number | null;
  detail: string;
};

export type ResultatExtraction = {
  produits: Produit[];
  tiers: Tiers[];
  tarifs: Tarif[];
  anomalies: Anomalie[];
  /** Lignes ecartees, qui ne produiront aucune entite. */
  lignesRejetees: number;
};

function texte(ligne: LigneBrute, champ: string): string {
  return nettoyerLibelle(ligne[champ]).valeur;
}

function entier(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const nombre = Number(valeur);
  return Number.isFinite(nombre) && Number.isInteger(nombre) ? nombre : null;
}

export function interpreterQualite(brute: string): QualiteTiers {
  switch (brute) {
    case 'F':
    case 'f':
      return 'fournisseur';
    case 'c':
      return 'client';
    case 'p':
    case 'P':
      return 'prospect';
    default:
      return 'inconnue';
  }
}

/** "a"/"A" = actif, "NA" = non actif, vide = non renseigne (traite comme actif). */
export function interpreterEtat(brut: string): boolean {
  return brut.trim().toUpperCase() !== 'NA';
}

export function extraire(lignes: readonly LigneBrute[], aujourdhui = new Date()): ResultatExtraction {
  const anomalies: Anomalie[] = [];
  const tarifs: Tarif[] = [];
  const produitsParId = new Map<number, Produit>();
  const nomsParProduit = new Map<number, Set<string>>();
  const tiersParId = new Map<number, Tiers>();
  const lignesVues = new Set<number>();
  let lignesRejetees = 0;

  const signaler = (type: TypeAnomalie, ligneId: number | null, detail: string) => {
    anomalies.push({ type, ligneId, detail });
  };

  for (const ligne of lignes) {
    const ligneId = entier(ligne[CHAMPS.ligneId] ?? ligne['mnk__key__id']);
    if (ligneId === null) {
      signaler('ligne_sans_identifiant', null, "Ligne sans identifiant exploitable, ignoree.");
      lignesRejetees += 1;
      continue;
    }
    if (lignesVues.has(ligneId)) {
      signaler('doublon_ligne_source', ligneId, `L'identifiant ${ligneId} apparait plusieurs fois.`);
      lignesRejetees += 1;
      continue;
    }
    lignesVues.add(ligneId);

    const produitId = entier(ligne[CHAMPS.produitId]) || null;
    const tiersId = entier(ligne[CHAMPS.tiersId]) || null;

    const nomProduitBrut = nettoyerLibelle(ligne[CHAMPS.produitNom]);
    const designationBrute = nettoyerLibelle(ligne[CHAMPS.designationLibre]);
    const codeChezTiers = texte(ligne, CHAMPS.codeChezTiers) || null;

    for (const [champ, resultat] of [
      ['designation', designationBrute],
      ['nom produit', nomProduitBrut],
    ] as const) {
      if (resultat.mojibakeRepare) {
        signaler('libelle_mojibake_repare', ligneId, `${champ} restaure : "${resultat.valeur}"`);
      }
      if (resultat.perteEncodage) {
        signaler(
          'libelle_perte_encodage',
          ligneId,
          `${champ} contient des caracteres perdus, non restaurables : "${resultat.valeur}"`,
        );
      }
    }

    const brutPrix = ligne[CHAMPS.prixFinal];
    const analysePrix = parseMontant(brutPrix);

    // Une ligne sans produit, sans libelle et sans reference fournisseur ne
    // designe rien d'identifiable : elle ne peut pas devenir un tarif.
    // Le prix eventuellement present est mentionne explicitement, parce qu'un
    // montant qui disparait de l'import doit se voir dans le rapport.
    if (!produitId && !designationBrute.valeur && !codeChezTiers) {
      const prixPerdu = analysePrix.ok && analysePrix.centimes > 0 ? ` Prix perdu : "${String(brutPrix)}".` : '';
      signaler(
        'ligne_totalement_vide',
        ligneId,
        `Ni produit lie, ni designation, ni reference tiers.${prixPerdu}`,
      );
      lignesRejetees += 1;
      continue;
    }

    // --- Prix -------------------------------------------------------------
    let prixLuCentimes: Centimes | null = null;
    let prixCentimes: Centimes | null = null;
    let echelle: EchelleSaisie = 'ariary_certain';
    let echelleCorrigee = false;
    let echelleIncertaine = false;

    if (analysePrix.ok && analysePrix.centimes > 0) {
      prixLuCentimes = analysePrix.centimes;
      echelle = classerEchelle(analysePrix.centimes);

      if (analysePrix.decimalesTronquees) {
        signaler('prix_decimales_tronquees', ligneId, `Prix "${String(brutPrix)}" tronque a deux decimales.`);
      }

      if (echelle === 'milliers_certain') {
        prixCentimes = corrigerMilliers(analysePrix.centimes);
        echelleCorrigee = true;
        signaler(
          'echelle_corrigee_automatiquement',
          ligneId,
          `Prix "${String(brutPrix)}" interprete comme des milliers d'ariary.`,
        );
      } else {
        prixCentimes = analysePrix.centimes;
        if (echelle === 'a_arbitrer') {
          echelleIncertaine = true;
          signaler(
            'echelle_a_arbitrer',
            ligneId,
            `Prix "${String(brutPrix)}" : ariary ou milliers d'ariary, a trancher.`,
          );
        }
      }
    } else if (!analysePrix.ok && analysePrix.raison === 'non_numerique') {
      signaler('prix_non_numerique', ligneId, `Prix illisible : "${analysePrix.brut}"`);
    } else if (!analysePrix.ok && analysePrix.raison === 'hors_limites') {
      signaler('prix_hors_limites', ligneId, `Prix aberrant : "${analysePrix.brut}"`);
    }

    if (prixCentimes === null) {
      signaler('tarif_sans_prix', ligneId, 'Aucun prix exploitable sur cette ligne.');
    }
    if (!produitId) {
      signaler(
        'tarif_sans_produit_lie',
        ligneId,
        `Aucun produit rattache. Designation libre : "${designationBrute.valeur || '(vide)'}"`,
      );
    }

    // --- Date -------------------------------------------------------------
    const brutDate = ligne[CHAMPS.date];
    const analyseDate = parseDateAAMMJJ(brutDate, aujourdhui);
    if (!analyseDate.ok && analyseDate.raison !== 'vide') {
      signaler('date_illisible', ligneId, `Date "${analyseDate.brut}" (${analyseDate.raison}).`);
    }

    const etatBrut = texte(ligne, CHAMPS.etat) || null;

    tarifs.push({
      sourceLigneId: ligneId,
      sourceProduitId: produitId,
      sourceTiersId: tiersId,
      designationLibre: designationBrute.valeur || null,
      designationNormalisee: designationBrute.valeur
        ? normaliserPourRecherche(designationBrute.valeur)
        : null,
      codeChezTiers,
      prixCentimes,
      prixLuCentimes,
      echelle,
      echelleCorrigee,
      echelleIncertaine,
      dateTarif: analyseDate.ok ? analyseDate.iso : null,
      etatBrut,
      actif: interpreterEtat(etatBrut ?? ''),
      societe: texte(ligne, CHAMPS.societe) || null,
    });

    // --- Produit ----------------------------------------------------------
    if (produitId) {
      const nom = nomProduitBrut.valeur;
      const existant = produitsParId.get(produitId);
      const noms = nomsParProduit.get(produitId) ?? new Set<string>();
      if (nom) noms.add(nom);
      nomsParProduit.set(produitId, noms);

      const image = ligne[CHAMPS.image];
      const aPhoto =
        typeof image === 'object' && image !== null && Number((image as { total?: unknown }).total) > 0;

      if (existant) {
        existant.nombreTarifs += 1;
        existant.codeProduitA ??= texte(ligne, CHAMPS.produitCodeA) || null;
        existant.codeProduitN ??= texte(ligne, CHAMPS.produitCodeN) || null;
        existant.famille ??= texte(ligne, CHAMPS.famille) || null;
        existant.aPhoto ||= aPhoto;
        if (!existant.nom && nom) {
          existant.nom = nom;
          existant.nomNormalise = normaliserPourRecherche(nom);
        }
      } else {
        produitsParId.set(produitId, {
          sourceProduitId: produitId,
          nom,
          nomNormalise: normaliserPourRecherche(nom),
          codeProduitA: texte(ligne, CHAMPS.produitCodeA) || null,
          codeProduitN: texte(ligne, CHAMPS.produitCodeN) || null,
          famille: texte(ligne, CHAMPS.famille) || null,
          aPhoto,
          nombreTarifs: 1,
        });
      }
    }

    // --- Tiers ------------------------------------------------------------
    if (tiersId) {
      const existant = tiersParId.get(tiersId);
      const qualiteBrute = texte(ligne, CHAMPS.tiersQualite) || null;
      if (existant) {
        existant.nombreTarifs += 1;
        existant.code ??= texte(ligne, CHAMPS.tiersCode) || null;
        if (existant.qualite === 'inconnue' && qualiteBrute) {
          existant.qualite = interpreterQualite(qualiteBrute);
          existant.qualiteBrute = qualiteBrute;
        }
      } else {
        tiersParId.set(tiersId, {
          sourceTiersId: tiersId,
          code: texte(ligne, CHAMPS.tiersCode) || null,
          qualite: interpreterQualite(qualiteBrute ?? ''),
          qualiteBrute,
          nombreTarifs: 1,
        });
      }
    }
  }

  const produits = [...produitsParId.values()];
  anomalies.push(...controlerCoherence(produits, nomsParProduit, tarifs));

  return {
    produits,
    tiers: [...tiersParId.values()],
    tarifs,
    anomalies,
    lignesRejetees,
  };
}

/**
 * Controles qui ne peuvent se faire qu'une fois toutes les lignes lues :
 * ils portent sur des collisions entre enregistrements, pas sur une ligne.
 */
function controlerCoherence(
  produits: readonly Produit[],
  nomsParProduit: ReadonlyMap<number, Set<string>>,
  tarifs: readonly Tarif[],
): Anomalie[] {
  const anomalies: Anomalie[] = [];

  for (const [produitId, noms] of nomsParProduit) {
    if (noms.size > 1) {
      anomalies.push({
        type: 'produit_noms_divergents',
        ligneId: null,
        detail: `Produit ${produitId} porte plusieurs noms : ${[...noms].join(' | ')}`,
      });
    }
  }

  const produitsParCode = new Map<string, Set<number>>();
  const produitsParNom = new Map<string, Set<number>>();
  for (const produit of produits) {
    if (produit.codeProduitA) {
      const lot = produitsParCode.get(produit.codeProduitA) ?? new Set<number>();
      lot.add(produit.sourceProduitId);
      produitsParCode.set(produit.codeProduitA, lot);
    }
    if (produit.nomNormalise) {
      const lot = produitsParNom.get(produit.nomNormalise) ?? new Set<number>();
      lot.add(produit.sourceProduitId);
      produitsParNom.set(produit.nomNormalise, lot);
    }
  }

  for (const [code, ids] of produitsParCode) {
    if (ids.size > 1) {
      anomalies.push({
        type: 'code_produit_partage',
        ligneId: null,
        detail: `Code produit "${code}" porte par ${ids.size} produits (${[...ids].join(', ')}). Inutilisable comme cle.`,
      });
    }
  }

  for (const [nom, ids] of produitsParNom) {
    if (ids.size > 1) {
      anomalies.push({
        type: 'nom_partage_par_plusieurs_produits',
        ligneId: null,
        detail: `Nom "${nom}" partage par les produits ${[...ids].join(', ')}.`,
      });
    }
  }

  const paires = new Map<string, Tarif[]>();
  for (const tarif of tarifs) {
    if (!tarif.sourceProduitId || !tarif.sourceTiersId) continue;
    const cle = `${tarif.sourceTiersId}|${tarif.sourceProduitId}`;
    const lot = paires.get(cle) ?? [];
    lot.push(tarif);
    paires.set(cle, lot);
  }
  for (const [cle, lot] of paires) {
    if (lot.length > 1) {
      const prix = lot.map((t) => (t.prixCentimes ?? 0) / 100).join(' / ');
      anomalies.push({
        type: 'doublon_tiers_produit',
        ligneId: lot[0]?.sourceLigneId ?? null,
        detail: `${lot.length} tarifs pour le couple (tiers|produit) ${cle} : ${prix}`,
      });
    }
  }

  return anomalies;
}
