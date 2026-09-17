<?php

declare(strict_types=1);

namespace App\Domaine;

use DateTimeImmutable;
use DateTimeZone;

/**
 * Les dates de l'export sont au format AAMMJJ ("260902" = 2 septembre 2026).
 * Le siecle n'est pas transmis : les valeurs observees vont de 230324 a
 * 260902, on prefixe donc par 20. Une date posterieure a aujourd'hui est
 * refusee plutot que passee sous silence : sur ce fichier elle signalerait
 * une saisie fautive, pas un tarif a venir.
 *
 * Portage de src/domaine/dates.ts.
 */
final class Dates
{
    private const UN_JOUR_SECONDES = 86400;

    /**
     * @param mixed $brut
     */
    public static function parseDateAAMMJJ($brut, ?DateTimeImmutable $aujourdhui = null): ResultatDate
    {
        $aujourdhui = $aujourdhui ?? new DateTimeImmutable('now', new DateTimeZone('UTC'));

        $texte = trim($brut === null ? '' : (string) $brut);
        if ($texte === '') {
            return ResultatDate::echec(ResultatDate::VIDE, $texte);
        }
        if (preg_match('/^\d{6}$/', $texte) !== 1) {
            return ResultatDate::echec(ResultatDate::FORMAT, $texte);
        }

        $annee = 2000 + (int) substr($texte, 0, 2);
        $mois = (int) substr($texte, 2, 2);
        $jour = (int) substr($texte, 4, 2);

        if ($mois < 1 || $mois > 12 || $jour < 1 || $jour > 31) {
            return ResultatDate::echec(ResultatDate::INVALIDE, $texte);
        }

        // checkdate rejette le 31 fevrier la ou une construction de date le
        // reporterait silencieusement au 3 mars.
        if (!checkdate($mois, $jour, $annee)) {
            return ResultatDate::echec(ResultatDate::INVALIDE, $texte);
        }

        $date = new DateTimeImmutable(
            sprintf('%04d-%02d-%02dT00:00:00', $annee, $mois, $jour),
            new DateTimeZone('UTC')
        );

        if ($date->getTimestamp() > $aujourdhui->getTimestamp() + self::UN_JOUR_SECONDES) {
            return ResultatDate::echec(ResultatDate::FUTURE, $texte);
        }

        return ResultatDate::succes($date->format('Y-m-d'));
    }
}
