<?php

declare(strict_types=1);

namespace App\Bdd;

use App\Domaine\Texte;
use App\Import\ResultatExtraction;
use PDO;

/**
 * Ecriture d'un resultat d'extraction dans la base.
 * Portage de src/bdd/ingestion.ts.
 *
 * Tout se fait dans une seule transaction : si quoi que ce soit echoue en
 * cours de route, la base reste exactement dans l'etat ou elle etait. Un
 * catalogue a moitie importe serait invisible a l'oeil nu et donnerait des
 * totaux faux pendant des semaines.
 *
 * Cette classe realise un import INITIAL (base vide ou remplacement complet).
 * La synchronisation differentielle, qui compare avec l'existant et demande
 * validation, est le sujet de la phase 4.
 */
final class Ingestion
{
    /** Types d'anomalie comptes comme des erreurs dans import_catalogue. */
    private const TYPES_ERREUR = ['prix_non_numerique', 'prix_hors_limites', 'ligne_sans_identifiant'];

    /**
     * @param array<string, mixed> $rapport Rapport d'import, tel que produit par
     *        la couche rapport. Cles lues ici : fichier.nom, lignes.presentes,
     *        lignes.rejetees, entites.produits, anomaliesParType[].{type,nombre}.
     *        Le rapport entier est serialise en JSON dans import_catalogue.
     * @param array{remplacer?: bool, utilisateur?: string|null} $options
     * @return array{importId: int, produitsInseres: int, tiersInseres: int, tarifsInseres: int}
     */
    public static function ingererImportInitial(
        PDO $pdo,
        ResultatExtraction $extraction,
        array $rapport,
        array $options = []
    ): array {
        $horodatage = Connexion::maintenant();
        $remplacer = $options['remplacer'] ?? false;
        $utilisateur = $options['utilisateur'] ?? null;

        return Connexion::enTransaction($pdo, static function () use (
            $pdo,
            $extraction,
            $rapport,
            $horodatage,
            $remplacer,
            $utilisateur
        ): array {
            if ($remplacer) {
                // Ordre impose par les cles etrangeres. Les documents ne sont
                // jamais touches : leurs lignes portent des copies, ils
                // survivent a un remplacement complet du catalogue.
                $pdo->exec('delete from tarif_recherche');
                $pdo->exec('delete from tarif');
                $pdo->exec('delete from produit');
                $pdo->exec('delete from tiers');
            }

            $nombreErreurs = 0;
            foreach ($rapport['anomaliesParType'] ?? [] as $groupe) {
                if (in_array($groupe['type'] ?? '', self::TYPES_ERREUR, true)) {
                    $nombreErreurs += (int) ($groupe['nombre'] ?? 0);
                }
            }

            $insererImport = $pdo->prepare(
                'insert into import_catalogue (
                    nom_fichier, date_import, utilisateur, statut,
                    nombre_lignes_analysees, nombre_produits_nouveaux, nombre_lignes_ignorees,
                    nombre_erreurs, rapport_json, cree_le
                 ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $insererImport->execute([
                $rapport['fichier']['nom'] ?? '',
                $horodatage,
                $utilisateur,
                'termine',
                (int) ($rapport['lignes']['presentes'] ?? 0),
                (int) ($rapport['entites']['produits'] ?? 0),
                (int) ($rapport['lignes']['rejetees'] ?? 0),
                $nombreErreurs,
                json_encode($rapport, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $horodatage,
            ]);
            $importId = (int) $pdo->lastInsertId();

            // --- Produits -------------------------------------------------
            $insererProduit = $pdo->prepare(
                'insert into produit (
                    source_produit_id, nom, nom_normalise, code_produit_a, code_produit_n,
                    famille, a_photo, actif, derniere_synchronisation, cree_le, modifie_le
                 ) values (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)'
            );
            $idsProduits = [];
            foreach ($extraction->produits as $produit) {
                $insererProduit->execute([
                    $produit->sourceProduitId,
                    $produit->nom,
                    $produit->nomNormalise,
                    $produit->codeProduitA,
                    $produit->codeProduitN,
                    $produit->famille,
                    Connexion::versEntier($produit->aPhoto),
                    $horodatage,
                    $horodatage,
                    $horodatage,
                ]);
                $idsProduits[$produit->sourceProduitId] = (int) $pdo->lastInsertId();
            }

            // --- Tiers ----------------------------------------------------
            $insererTiers = $pdo->prepare(
                'insert into tiers (source_tiers_id, code, nom, qualite, actif, cree_le, modifie_le)
                 values (?, ?, ?, ?, 1, ?, ?)'
            );
            $idsTiers = [];
            foreach ($extraction->tiers as $tiers) {
                $insererTiers->execute([
                    $tiers->sourceTiersId,
                    $tiers->code,
                    // Le module 21 ne transporte aucun nom de tiers : le code
                    // fait office de libelle tant que le module Tiers n'a pas
                    // ete exporte.
                    null,
                    $tiers->qualite,
                    $horodatage,
                    $horodatage,
                ]);
                $idsTiers[$tiers->sourceTiersId] = (int) $pdo->lastInsertId();
            }

            // --- Tarifs et index de recherche -------------------------------
            $insererTarif = $pdo->prepare(
                'insert into tarif (
                    source_ligne_id, produit_id, tiers_id, designation_libre, designation_normalisee,
                    code_chez_tiers, prix_centimes, prix_lu_centimes, echelle, echelle_corrigee,
                    echelle_incertaine, date_tarif, actif, societe, import_id, cree_le, modifie_le
                 ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $insererRecherche = $pdo->prepare(
                'insert into tarif_recherche (tarif_id, libelle_normalise, code_normalise, fournisseur_normalise)
                 values (?, ?, ?, ?)'
            );

            $produitsParSource = [];
            foreach ($extraction->produits as $produit) {
                $produitsParSource[$produit->sourceProduitId] = $produit;
            }
            $tiersParSource = [];
            foreach ($extraction->tiers as $tiers) {
                $tiersParSource[$tiers->sourceTiersId] = $tiers;
            }

            foreach ($extraction->tarifs as $tarif) {
                $produitId = $tarif->sourceProduitId !== null
                    ? ($idsProduits[$tarif->sourceProduitId] ?? null)
                    : null;
                $tiersId = $tarif->sourceTiersId !== null
                    ? ($idsTiers[$tarif->sourceTiersId] ?? null)
                    : null;

                $insererTarif->execute([
                    $tarif->sourceLigneId,
                    $produitId,
                    $tiersId,
                    $tarif->designationLibre,
                    $tarif->designationNormalisee,
                    $tarif->codeChezTiers,
                    $tarif->prixCentimes,
                    $tarif->prixLuCentimes,
                    $tarif->echelle,
                    Connexion::versEntier($tarif->echelleCorrigee),
                    Connexion::versEntier($tarif->echelleIncertaine),
                    $tarif->dateTarif,
                    Connexion::versEntier($tarif->actif),
                    $tarif->societe,
                    $importId,
                    $horodatage,
                    $horodatage,
                ]);
                $tarifId = (int) $pdo->lastInsertId();

                $produit = $tarif->sourceProduitId !== null
                    ? ($produitsParSource[$tarif->sourceProduitId] ?? null)
                    : null;
                $tiers = $tarif->sourceTiersId !== null
                    ? ($tiersParSource[$tarif->sourceTiersId] ?? null)
                    : null;

                // Le nom officiel du produit ET la designation du tiers sont
                // indexes : les deux circulent dans l'entreprise, et l'un ne
                // remplace pas l'autre. Le dedoublonnage evite d'indexer deux
                // fois le meme texte quand ils coincident, ce qui fausserait
                // le classement en gonflant la frequence des termes.
                $libelles = [];
                foreach ([$produit ? $produit->nom : null, $tarif->designationLibre] as $valeur) {
                    if ($valeur !== null && $valeur !== '') {
                        $libelles[$valeur] = true;
                    }
                }
                $codes = [];
                foreach (
                    [
                        $produit ? $produit->codeProduitA : null,
                        $produit ? $produit->codeProduitN : null,
                        $tarif->codeChezTiers,
                    ] as $valeur
                ) {
                    if ($valeur !== null && $valeur !== '') {
                        $codes[] = $valeur;
                    }
                }

                $insererRecherche->execute([
                    $tarifId,
                    Texte::normaliserPourRecherche(implode(' ', array_keys($libelles))),
                    Texte::normaliserPourRecherche(implode(' ', $codes)),
                    Texte::normaliserPourRecherche($tiers && $tiers->code !== null ? $tiers->code : ''),
                ]);
            }

            return [
                'importId' => $importId,
                'produitsInseres' => count($extraction->produits),
                'tiersInseres' => count($extraction->tiers),
                'tarifsInseres' => count($extraction->tarifs),
            ];
        });
    }
}
