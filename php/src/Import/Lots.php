<?php

declare(strict_types=1);

namespace App\Import;

use App\Domaine\Monnaie;

/**
 * Regroupement des tarifs en "lots de saisie".
 * Portage de src/import/lots.ts.
 *
 * L'analyse du fichier KA a montre que l'echelle (ariary ou milliers
 * d'ariary) ne depend ni du produit ni du fournisseur, mais du moment ou la
 * ligne a ete saisie : des blocs entiers d'identifiants consecutifs, chez un
 * meme tiers, ont ete tapes dans la meme unite.
 *
 * Regrouper ainsi permet d'arbitrer par lot plutot que ligne a ligne. Les
 * lots ne sont toutefois PAS homogenes a coup sur : certains melangent les
 * deux echelles. Ils servent a presenter le travail dans un ordre utile, pas
 * a decider a la place de l'utilisateur.
 */
final class Lots
{
    /** Au-dela de cet ecart d'identifiants, on considere une autre session de saisie. */
    public const ECART_ID_NOUVEAU_LOT = 2000;

    /**
     * @param Tarif[] $tarifs
     * @return LotSaisie[]
     */
    public static function construireLots(array $tarifs): array
    {
        $avecPrix = [];
        foreach ($tarifs as $tarif) {
            if ($tarif->prixLuCentimes !== null && $tarif->prixLuCentimes > 0) {
                $avecPrix[] = $tarif;
            }
        }

        usort($avecPrix, static function (Tarif $a, Tarif $b): int {
            return $a->sourceLigneId <=> $b->sourceLigneId;
        });

        /** @var LotSaisie[] $lots */
        $lots = [];
        $courant = null;

        foreach ($avecPrix as $tarif) {
            $memeTiers = $courant !== null && $courant->sourceTiersId === $tarif->sourceTiersId;
            $proche = $courant !== null
                && $tarif->sourceLigneId - $courant->dernierLigneId <= self::ECART_ID_NOUVEAU_LOT;

            if ($courant === null || !$memeTiers || !$proche) {
                $courant = new LotSaisie(
                    'lot-' . (count($lots) + 1),
                    $tarif->sourceTiersId,
                    $tarif->sourceLigneId,
                    $tarif->sourceLigneId
                );
                $lots[] = $courant;
            }

            $courant->dernierLigneId = $tarif->sourceLigneId;
            $courant->tarifs[] = $tarif;
        }

        foreach ($lots as $lot) {
            // On raisonne sur la valeur LUE, pas sur la valeur corrigee :
            // c'est l'unite de saisie d'origine que l'on cherche a reconnaitre.
            $ariary = [];
            foreach ($lot->tarifs as $tarif) {
                $ariary[] = ($tarif->prixLuCentimes ?? 0) / Monnaie::CENTIMES_PAR_ARIARY;
            }

            $lot->medianeAriary = self::mediane($ariary);
            $lot->minAriary = $ariary === [] ? 0.0 : min($ariary);
            $lot->maxAriary = $ariary === [] ? 0.0 : max($ariary);

            $incertains = 0;
            $corriges = 0;
            $aMilliers = false;
            $aAriary = false;
            foreach ($lot->tarifs as $tarif) {
                if ($tarif->echelleIncertaine) {
                    $incertains++;
                }
                if ($tarif->echelleCorrigee) {
                    $corriges++;
                }
                if ($tarif->echelle === Monnaie::ECHELLE_MILLIERS_CERTAIN) {
                    $aMilliers = true;
                }
                if ($tarif->echelle === Monnaie::ECHELLE_ARIARY_CERTAIN) {
                    $aAriary = true;
                }
            }

            $lot->nombreIncertains = $incertains;
            $lot->nombreCorriges = $corriges;
            $lot->demandeArbitrage = $incertains > 0;
            $lot->echellesMelangees = $aMilliers && $aAriary;
        }

        return $lots;
    }

    /**
     * @param LotSaisie[] $lots
     * @return array{nombreLots: int, lotsHomogenes: int, lotsMelanges: int, lotsADemanderArbitrage: int, lignesAArbitrer: int}
     */
    public static function synthetiserLots(array $lots): array
    {
        $homogenes = 0;
        $melanges = 0;
        $arbitrage = 0;
        $lignes = 0;

        foreach ($lots as $lot) {
            if ($lot->echellesMelangees) {
                $melanges++;
            } else {
                $homogenes++;
            }
            if ($lot->demandeArbitrage) {
                $arbitrage++;
            }
            $lignes += $lot->nombreIncertains;
        }

        return [
            'nombreLots' => count($lots),
            'lotsHomogenes' => $homogenes,
            'lotsMelanges' => $melanges,
            'lotsADemanderArbitrage' => $arbitrage,
            'lignesAArbitrer' => $lignes,
        ];
    }

    /** @param float[] $valeurs */
    private static function mediane(array $valeurs): float
    {
        if ($valeurs === []) {
            return 0.0;
        }

        $triees = $valeurs;
        sort($triees);
        $milieu = intdiv(count($triees), 2);

        if (count($triees) % 2 === 1) {
            return (float) $triees[$milieu];
        }

        return ((float) $triees[$milieu - 1] + (float) $triees[$milieu]) / 2;
    }
}
