import type { FichierExport } from './schema.js';
import type { Anomalie, ResultatExtraction, TypeAnomalie } from './extraction.js';
import type { LotSaisie } from './lots.js';
import { synthetiserLots } from './lots.js';
import { formaterAriary } from '../domaine/monnaie.js';

/**
 * Construction et rendu du rapport d'import.
 *
 * Le rapport est le livrable de la phase 1 : c'est lui qui doit permettre de
 * juger si l'import est fidele, AVANT qu'une interface n'existe. Il est donc
 * produit sous deux formes : un objet serialisable (destine a la table
 * ImportCatalogue et a l'ecran de synchronisation) et un rendu texte lisible
 * en console.
 */

export type RapportImport = {
  fichier: {
    nom: string;
    source: string | null;
    moduleId: string;
    viewId: string | null;
    societe: string | null;
    extraitLe: string | null;
    tailleOctets: number;
  };
  lignes: {
    annoncees: number | null;
    presentes: number;
    perduesCoteServeur: number;
    rejetees: number;
    retenues: number;
  };
  entites: {
    produits: number;
    produitsAvecNom: number;
    produitsAvecCode: number;
    produitsAvecPhoto: number;
    tiers: number;
    fournisseurs: number;
    clients: number;
    prospects: number;
    tiersQualiteInconnue: number;
    tarifs: number;
    tarifsAvecPrix: number;
    tarifsSansPrix: number;
    tarifsSansProduit: number;
  };
  echelles: {
    corrigeesAutomatiquement: number;
    aArbitrer: number;
    inchangees: number;
    lots: number;
    lotsAArbitrer: number;
    lotsMelanges: number;
  };
  prix: {
    minCentimes: number | null;
    medianeCentimes: number | null;
    maxCentimes: number | null;
  };
  anomaliesParType: Array<{ type: TypeAnomalie; nombre: number; exemples: string[] }>;
  avertissements: string[];
};

const LIBELLES_ANOMALIES: Record<TypeAnomalie, string> = {
  ligne_sans_identifiant: "Lignes sans identifiant exploitable",
  ligne_totalement_vide: "Lignes vides (ni produit, ni designation, ni reference)",
  tarif_sans_prix: "Tarifs sans prix exploitable",
  tarif_sans_produit_lie: "Tarifs non rattaches a un produit (designation libre)",
  prix_non_numerique: "Prix illisibles",
  prix_hors_limites: "Prix aberrants",
  prix_decimales_tronquees: "Prix tronques a deux decimales",
  echelle_corrigee_automatiquement: "Prix convertis depuis les milliers d'ariary",
  echelle_a_arbitrer: "Prix dont l'echelle doit etre tranchee",
  libelle_mojibake_repare: "Libelles d'encodage repares",
  libelle_perte_encodage: "Libelles dont des caracteres sont perdus",
  date_illisible: "Dates illisibles",
  doublon_ligne_source: "Identifiants de ligne en double",
  doublon_tiers_produit: "Couples (tiers, produit) en double",
  produit_noms_divergents: "Produits portant plusieurs noms",
  code_produit_partage: "Codes produit partages par plusieurs produits",
  nom_partage_par_plusieurs_produits: "Noms partages par plusieurs produits",
};

function regrouperAnomalies(anomalies: readonly Anomalie[]) {
  const parType = new Map<TypeAnomalie, Anomalie[]>();
  for (const anomalie of anomalies) {
    const lot = parType.get(anomalie.type) ?? [];
    lot.push(anomalie);
    parType.set(anomalie.type, lot);
  }
  return [...parType.entries()]
    .map(([type, lot]) => ({
      type,
      nombre: lot.length,
      exemples: lot.slice(0, 5).map((a) => (a.ligneId ? `[${a.ligneId}] ${a.detail}` : a.detail)),
    }))
    .sort((a, b) => b.nombre - a.nombre);
}

function statistiquesPrix(extraction: ResultatExtraction) {
  const prix = extraction.tarifs
    .map((tarif) => tarif.prixCentimes)
    .filter((valeur): valeur is number => valeur !== null && valeur > 0)
    .sort((a, b) => a - b);

  if (prix.length === 0) return { minCentimes: null, medianeCentimes: null, maxCentimes: null };
  return {
    minCentimes: prix[0] ?? null,
    medianeCentimes: prix[Math.floor(prix.length / 2)] ?? null,
    maxCentimes: prix[prix.length - 1] ?? null,
  };
}

export function construireRapport(params: {
  nomFichier: string;
  tailleOctets: number;
  fichier: FichierExport;
  extraction: ResultatExtraction;
  lots: readonly LotSaisie[];
  avertissements: readonly string[];
}): RapportImport {
  const { nomFichier, tailleOctets, fichier, extraction, lots, avertissements } = params;
  const syntheseLots = synthetiserLots(lots);

  const perdues = fichier.skippedRecords.reduce((somme, ignore) => somme + ignore.size, 0);
  const tarifsAvecPrix = extraction.tarifs.filter((tarif) => tarif.prixCentimes !== null).length;

  return {
    fichier: {
      nom: nomFichier,
      source: fichier.source ?? null,
      moduleId: String(fichier.moduleId),
      viewId: fichier.viewId !== undefined ? String(fichier.viewId) : null,
      societe: fichier.societeFilter ?? null,
      extraitLe: fichier.extractedAt ?? null,
      tailleOctets,
    },
    lignes: {
      annoncees: fichier.expectedTotal ?? null,
      presentes: fichier.rows.length,
      perduesCoteServeur: perdues,
      rejetees: extraction.lignesRejetees,
      retenues: extraction.tarifs.length,
    },
    entites: {
      produits: extraction.produits.length,
      produitsAvecNom: extraction.produits.filter((produit) => produit.nom !== '').length,
      produitsAvecCode: extraction.produits.filter((produit) => produit.codeProduitA !== null).length,
      produitsAvecPhoto: extraction.produits.filter((produit) => produit.aPhoto).length,
      tiers: extraction.tiers.length,
      fournisseurs: extraction.tiers.filter((tiers) => tiers.qualite === 'fournisseur').length,
      clients: extraction.tiers.filter((tiers) => tiers.qualite === 'client').length,
      prospects: extraction.tiers.filter((tiers) => tiers.qualite === 'prospect').length,
      tiersQualiteInconnue: extraction.tiers.filter((tiers) => tiers.qualite === 'inconnue').length,
      tarifs: extraction.tarifs.length,
      tarifsAvecPrix,
      tarifsSansPrix: extraction.tarifs.length - tarifsAvecPrix,
      tarifsSansProduit: extraction.tarifs.filter((tarif) => tarif.sourceProduitId === null).length,
    },
    echelles: {
      corrigeesAutomatiquement: extraction.tarifs.filter((tarif) => tarif.echelleCorrigee).length,
      aArbitrer: extraction.tarifs.filter((tarif) => tarif.echelleIncertaine).length,
      inchangees: extraction.tarifs.filter(
        (tarif) => tarif.prixCentimes !== null && !tarif.echelleCorrigee && !tarif.echelleIncertaine,
      ).length,
      lots: syntheseLots.nombreLots,
      lotsAArbitrer: syntheseLots.lotsADemanderArbitrage,
      lotsMelanges: syntheseLots.lotsMelanges,
    },
    prix: statistiquesPrix(extraction),
    anomaliesParType: regrouperAnomalies(extraction.anomalies),
    avertissements: [...avertissements],
  };
}

function ligneTitre(titre: string): string {
  return `\n${titre}\n${'='.repeat(titre.length)}`;
}

function paire(libelle: string, valeur: string | number): string {
  return `  ${libelle.padEnd(46, '.')} ${String(valeur).padStart(10)}`;
}

export function rendreRapportTexte(rapport: RapportImport): string {
  const lignes: string[] = [];

  lignes.push(ligneTitre("RAPPORT D'IMPORT"));
  lignes.push(`  Fichier    : ${rapport.fichier.nom}`);
  lignes.push(`  Module     : ${rapport.fichier.moduleId} / vue ${rapport.fichier.viewId ?? '-'}`);
  lignes.push(`  Societe    : ${rapport.fichier.societe ?? '-'}`);
  lignes.push(`  Extrait le : ${rapport.fichier.extraitLe ?? '-'}`);
  lignes.push(`  Taille     : ${(rapport.fichier.tailleOctets / 1024 / 1024).toFixed(2)} Mo`);

  lignes.push(ligneTitre('LIGNES'));
  lignes.push(paire('Annoncees par le portail', rapport.lignes.annoncees ?? '-'));
  lignes.push(paire('Presentes dans le fichier', rapport.lignes.presentes));
  lignes.push(paire('Perdues cote serveur (erreurs 500)', rapport.lignes.perduesCoteServeur));
  lignes.push(paire('Rejetees a la lecture', rapport.lignes.rejetees));
  lignes.push(paire('Retenues comme tarifs', rapport.lignes.retenues));

  lignes.push(ligneTitre('ENTITES RECONSTITUEES'));
  lignes.push(paire('Produits distincts', rapport.entites.produits));
  lignes.push(paire('  dont avec un nom', rapport.entites.produitsAvecNom));
  lignes.push(paire('  dont avec un code produit', rapport.entites.produitsAvecCode));
  lignes.push(paire('  dont avec une photo', rapport.entites.produitsAvecPhoto));
  lignes.push(paire('Tiers distincts', rapport.entites.tiers));
  lignes.push(paire('  dont fournisseurs', rapport.entites.fournisseurs));
  lignes.push(paire('  dont clients', rapport.entites.clients));
  lignes.push(paire('  dont prospects', rapport.entites.prospects));
  lignes.push(paire('  dont qualite non renseignee', rapport.entites.tiersQualiteInconnue));
  lignes.push(paire('Tarifs', rapport.entites.tarifs));
  lignes.push(paire('  dont avec un prix', rapport.entites.tarifsAvecPrix));
  lignes.push(paire('  dont sans prix', rapport.entites.tarifsSansPrix));
  lignes.push(paire('  dont sans produit rattache', rapport.entites.tarifsSansProduit));

  lignes.push(ligneTitre("ECHELLE DE SAISIE (ariary / milliers d'ariary)"));
  lignes.push(paire('Corrigees automatiquement (x1000)', rapport.echelles.corrigeesAutomatiquement));
  lignes.push(paire('A ARBITRER MANUELLEMENT', rapport.echelles.aArbitrer));
  lignes.push(paire('Inchangees', rapport.echelles.inchangees));
  lignes.push(paire('Lots de saisie identifies', rapport.echelles.lots));
  lignes.push(paire('  dont lots a arbitrer', rapport.echelles.lotsAArbitrer));
  lignes.push(paire('  dont lots melangeant deux echelles', rapport.echelles.lotsMelanges));

  lignes.push(ligneTitre('PRIX APRES CORRECTION'));
  lignes.push(
    paire('Minimum', rapport.prix.minCentimes !== null ? formaterAriary(rapport.prix.minCentimes) : '-'),
  );
  lignes.push(
    paire('Mediane', rapport.prix.medianeCentimes !== null ? formaterAriary(rapport.prix.medianeCentimes) : '-'),
  );
  lignes.push(
    paire('Maximum', rapport.prix.maxCentimes !== null ? formaterAriary(rapport.prix.maxCentimes) : '-'),
  );

  lignes.push(ligneTitre('ANOMALIES'));
  if (rapport.anomaliesParType.length === 0) {
    lignes.push('  Aucune.');
  }
  for (const groupe of rapport.anomaliesParType) {
    lignes.push(paire(LIBELLES_ANOMALIES[groupe.type] ?? groupe.type, groupe.nombre));
    for (const exemple of groupe.exemples) {
      lignes.push(`      - ${exemple.slice(0, 110)}`);
    }
  }

  if (rapport.avertissements.length > 0) {
    lignes.push(ligneTitre('AVERTISSEMENTS'));
    for (const avertissement of rapport.avertissements) {
      lignes.push(`  ! ${avertissement}`);
    }
  }

  return lignes.join('\n');
}
