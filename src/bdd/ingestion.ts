import type { Bdd } from './connexion.js';
import { enTransaction, maintenant, versEntier } from './connexion.js';
import type { ResultatExtraction } from '../import/extraction.js';
import type { RapportImport } from '../import/rapport.js';

/**
 * Ecriture d'un resultat d'extraction dans la base.
 *
 * Tout se fait dans une seule transaction : si quoi que ce soit echoue en
 * cours de route, la base reste exactement dans l'etat ou elle etait. Un
 * catalogue a moitie importe serait invisible a l'oeil nu et donnerait des
 * totaux faux pendant des semaines.
 *
 * Cette fonction realise un import INITIAL (base vide ou remplacement
 * complet). La synchronisation differentielle, qui compare avec l'existant et
 * demande validation, est le sujet de la phase 4.
 */

export type ResultatIngestion = {
  importId: number;
  produitsInseres: number;
  tiersInseres: number;
  tarifsInseres: number;
};

export function ingererImportInitial(
  bdd: Bdd,
  extraction: ResultatExtraction,
  rapport: RapportImport,
  options: { remplacer?: boolean; utilisateur?: string } = {},
): ResultatIngestion {
  const horodatage = maintenant();

  return enTransaction(bdd, () => {
    if (options.remplacer) {
      // Ordre impose par les cles etrangeres. Les documents ne sont jamais
      // touches : leurs lignes portent des copies, ils survivent a un
      // remplacement complet du catalogue.
      bdd.exec('delete from tarif_recherche');
      bdd.exec('delete from tarif');
      bdd.exec('delete from produit');
      bdd.exec('delete from tiers');
    }

    const insererImport = bdd.prepare(`
      insert into import_catalogue (
        nom_fichier, date_import, utilisateur, statut,
        nombre_lignes_analysees, nombre_produits_nouveaux, nombre_lignes_ignorees,
        nombre_erreurs, rapport_json, cree_le
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const nombreErreurs = rapport.anomaliesParType
      .filter((groupe) =>
        (['prix_non_numerique', 'prix_hors_limites', 'ligne_sans_identifiant'] as string[]).includes(
          groupe.type,
        ),
      )
      .reduce((somme, groupe) => somme + groupe.nombre, 0);

    const resultatImport = insererImport.run(
      rapport.fichier.nom,
      horodatage,
      options.utilisateur ?? null,
      'termine',
      rapport.lignes.presentes,
      rapport.entites.produits,
      rapport.lignes.rejetees,
      nombreErreurs,
      JSON.stringify(rapport),
      horodatage,
    );
    const importId = Number(resultatImport.lastInsertRowid);

    // --- Produits ---------------------------------------------------------
    const insererProduit = bdd.prepare(`
      insert into produit (
        source_produit_id, nom, nom_normalise, code_produit_a, code_produit_n,
        famille, a_photo, actif, derniere_synchronisation, cree_le, modifie_le
      ) values (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);
    const idsProduits = new Map<number, number>();
    for (const produit of extraction.produits) {
      const resultat = insererProduit.run(
        produit.sourceProduitId,
        produit.nom,
        produit.nomNormalise,
        produit.codeProduitA,
        produit.codeProduitN,
        produit.famille,
        versEntier(produit.aPhoto),
        horodatage,
        horodatage,
        horodatage,
      );
      idsProduits.set(produit.sourceProduitId, Number(resultat.lastInsertRowid));
    }

    // --- Tiers ------------------------------------------------------------
    const insererTiers = bdd.prepare(`
      insert into tiers (source_tiers_id, code, nom, qualite, actif, cree_le, modifie_le)
      values (?, ?, ?, ?, 1, ?, ?)
    `);
    const idsTiers = new Map<number, number>();
    for (const tiers of extraction.tiers) {
      const resultat = insererTiers.run(
        tiers.sourceTiersId,
        tiers.code,
        // Le module 21 ne transporte aucun nom de tiers : le code fait office
        // de libelle tant que le module Tiers n'a pas ete exporte.
        null,
        tiers.qualite,
        horodatage,
        horodatage,
      );
      idsTiers.set(tiers.sourceTiersId, Number(resultat.lastInsertRowid));
    }

    // --- Tarifs et index de recherche --------------------------------------
    const insererTarif = bdd.prepare(`
      insert into tarif (
        source_ligne_id, produit_id, tiers_id, designation_libre, designation_normalisee,
        code_chez_tiers, prix_centimes, prix_lu_centimes, echelle, echelle_corrigee,
        echelle_incertaine, date_tarif, actif, societe, import_id, cree_le, modifie_le
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insererRecherche = bdd.prepare(`
      insert into tarif_recherche (rowid, libelle, code, fournisseur) values (?, ?, ?, ?)
    `);

    const produitsParSource = new Map(
      extraction.produits.map((produit) => [produit.sourceProduitId, produit]),
    );
    const tiersParSource = new Map(extraction.tiers.map((tiers) => [tiers.sourceTiersId, tiers]));

    for (const tarif of extraction.tarifs) {
      const produitId = tarif.sourceProduitId ? idsProduits.get(tarif.sourceProduitId) ?? null : null;
      const tiersId = tarif.sourceTiersId ? idsTiers.get(tarif.sourceTiersId) ?? null : null;

      const resultat = insererTarif.run(
        tarif.sourceLigneId,
        produitId,
        tiersId,
        tarif.designationLibre,
        tarif.designationNormalisee,
        tarif.codeChezTiers,
        tarif.prixCentimes,
        tarif.prixLuCentimes,
        tarif.echelle,
        versEntier(tarif.echelleCorrigee),
        versEntier(tarif.echelleIncertaine),
        tarif.dateTarif,
        versEntier(tarif.actif),
        tarif.societe,
        importId,
        horodatage,
        horodatage,
      );

      const produit = tarif.sourceProduitId ? produitsParSource.get(tarif.sourceProduitId) : undefined;
      const tiers = tarif.sourceTiersId ? tiersParSource.get(tarif.sourceTiersId) : undefined;

      // Le nom officiel du produit ET la designation du tiers sont indexes :
      // les deux circulent dans l'entreprise, et l'un ne remplace pas l'autre.
      // Le Set evite d'indexer deux fois le meme texte quand ils coincident,
      // ce qui fausserait le classement en gonflant la frequence des termes.
      const libelle = [
        ...new Set(
          [produit?.nom, tarif.designationLibre].filter((valeur): valeur is string => Boolean(valeur)),
        ),
      ].join(' ');
      const codes = [produit?.codeProduitA, produit?.codeProduitN, tarif.codeChezTiers]
        .filter((valeur): valeur is string => Boolean(valeur))
        .join(' ');

      insererRecherche.run(
        Number(resultat.lastInsertRowid),
        libelle,
        codes,
        tiers?.code ?? '',
      );
    }

    return {
      importId,
      produitsInseres: extraction.produits.length,
      tiersInseres: extraction.tiers.length,
      tarifsInseres: extraction.tarifs.length,
    };
  });
}
