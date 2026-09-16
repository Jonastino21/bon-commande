<?php

declare(strict_types=1);

namespace App\Domaine;

use InvalidArgumentException;

/**
 * Montants monetaires. Portage de src/domaine/monnaie.ts.
 *
 * Regle absolue du projet : aucun montant ne transite jamais sous forme de
 * nombre a virgule flottante. Tout est stocke et calcule en ENTIERS de
 * centimes d'ariary.
 *
 * Le piege classique que ce module evite : (float)"0.29" * 100 vaut
 * 28.999999999999996 en IEEE 754. Tronque, cela fait 28 centimes au lieu de
 * 29. Idem pour "1.15" (114), "4.35" (434), "8.20" (819).
 *
 * Attention en relisant ce module : la majorite des valeurs passent sans
 * incident ("28166.67" * 100 vaut exactement 2816667). Un test au hasard
 * donne donc l'impression que cette precaution ne sert a rien. Elle sert.
 *
 * Marge disponible : PHP_INT_MAX vaut 9,2 x 10^18 sur une machine 64 bits,
 * contre un plafond metier de 10^11 centimes. C'est plus confortable qu'en
 * JavaScript, ou Number.MAX_SAFE_INTEGER s'arrete a 9 x 10^15.
 */
final class Monnaie
{
    public const CENTIMES_PAR_ARIARY = 100;

    /**
     * Seuils de detection de l'echelle de saisie (voir analyse du fichier
     * KA) : une partie des lignes a ete saisie en milliers d'ariary
     * ("8.50" = 8 500 Ar). La distribution des prix est continue, aucun
     * seuil ne separe proprement les deux echelles ; ces bornes delimitent
     * donc seulement ce qui est certain, le reste part en arbitrage humain.
     */
    public const SEUIL_MILLIERS_CERTAIN_ARIARY = 100;
    public const SEUIL_ARIARY_CERTAIN = 3000;

    public const ECHELLE_MILLIERS_CERTAIN = 'milliers_certain';
    public const ECHELLE_A_ARBITRER = 'a_arbitrer';
    public const ECHELLE_ARIARY_CERTAIN = 'ariary_certain';

    /** Au-dela, on considere que la valeur est aberrante plutot que reelle. */
    public const PLAFOND_ARIARY = 1000000000;

    public const MILLIEMES_PAR_UNITE = 1000;

    /**
     * Convertit une valeur brute de l'export ("34400.00", "8,50", 1500) en
     * centimes entiers, sans jamais passer par une multiplication flottante.
     *
     * @param mixed $brut
     */
    public static function parseMontant($brut): ResultatMontant
    {
        $origine = $brut === null ? '' : (string) $brut;
        $texte = str_replace(',', '.', (string) preg_replace('/\s/u', '', trim($origine)));

        if ($texte === '') {
            return ResultatMontant::echec(ResultatMontant::VIDE, $origine);
        }
        if (preg_match('/^-?\d+(\.\d+)?$/', $texte) !== 1) {
            return ResultatMontant::echec(ResultatMontant::NON_NUMERIQUE, $texte);
        }
        if ($texte[0] === '-') {
            return ResultatMontant::echec(ResultatMontant::NEGATIF, $texte);
        }

        $morceaux = explode('.', $texte);
        $partieEntiere = $morceaux[0] === '' ? '0' : $morceaux[0];
        $partieDecimale = $morceaux[1] ?? '';

        // On garde deux decimales. Au-dela, on tronque en le signalant.
        $deuxDecimales = str_pad(substr($partieDecimale, 0, 2), 2, '0', STR_PAD_RIGHT);
        $decimalesTronquees = strlen($partieDecimale) > 2;

        /*
         * Le controle de plafond se fait AVANT la multiplication, sur la
         * longueur de la chaine. Multiplier d'abord puis comparer laisserait
         * un depassement d'entier 64 bits basculer silencieusement en
         * flottant, et la comparaison porterait alors sur une valeur deja
         * fausse. On refuse donc sur la taille du texte, jamais sur le
         * resultat du calcul.
         */
        $partieEntiere = ltrim($partieEntiere, '0');
        if ($partieEntiere === '') {
            $partieEntiere = '0';
        }
        if (strlen($partieEntiere) > 10) {
            return ResultatMontant::echec(ResultatMontant::HORS_LIMITES, $texte);
        }

        $centimes = (int) $partieEntiere * self::CENTIMES_PAR_ARIARY + (int) $deuxDecimales;

        if ($centimes > self::PLAFOND_ARIARY * self::CENTIMES_PAR_ARIARY) {
            return ResultatMontant::echec(ResultatMontant::HORS_LIMITES, $texte);
        }

        return ResultatMontant::succes($centimes, $decimalesTronquees);
    }

    /** Classe un montant selon l'echelle de saisie dont il releve probablement. */
    public static function classerEchelle(int $centimes): string
    {
        // Comparaison en centimes, pas en ariary : diviser par 100 ferait
        // reapparaitre un flottant dans une regle de decision.
        if ($centimes < self::SEUIL_MILLIERS_CERTAIN_ARIARY * self::CENTIMES_PAR_ARIARY) {
            return self::ECHELLE_MILLIERS_CERTAIN;
        }
        if ($centimes < self::SEUIL_ARIARY_CERTAIN * self::CENTIMES_PAR_ARIARY) {
            return self::ECHELLE_A_ARBITRER;
        }

        return self::ECHELLE_ARIARY_CERTAIN;
    }

    /** Applique la correction d'echelle "saisi en milliers d'ariary". */
    public static function corrigerMilliers(int $centimes): int
    {
        return $centimes * 1000;
    }

    /**
     * La quantite peut etre decimale (kg, litre, metre) : on la traite en
     * milliemes entiers pour ne pas reintroduire de flottant dans le calcul.
     */
    public static function quantiteEnMilliemes(float $quantite): int
    {
        return (int) round($quantite * self::MILLIEMES_PAR_UNITE);
    }

    /**
     * Sous-total d'une ligne de document.
     *
     * Ecart assume avec le TypeScript, qui calcule
     * Math.round((prix * qte) / 1000) et passe donc par une division
     * flottante. Ici le quotient et le reste restent entiers d'un bout a
     * l'autre : l'arrondi au demi superieur est exact, sans IEEE 754.
     */
    public static function sousTotal(int $prixUnitaireCentimes, int $quantiteMilliemes): int
    {
        if ($prixUnitaireCentimes < 0 || $quantiteMilliemes < 0) {
            throw new InvalidArgumentException('Prix et quantite doivent etre positifs.');
        }

        $produit = $prixUnitaireCentimes * $quantiteMilliemes;
        $quotient = intdiv($produit, self::MILLIEMES_PAR_UNITE);
        $reste = $produit % self::MILLIEMES_PAR_UNITE;

        return ($reste * 2 >= self::MILLIEMES_PAR_UNITE) ? $quotient + 1 : $quotient;
    }

    /** @param int[] $sousTotaux */
    public static function totalGeneral(array $sousTotaux): int
    {
        return array_sum($sousTotaux);
    }

    /**
     * Groupement par milliers avec une espace ordinaire.
     *
     * NumberFormatter de l'extension intl est volontairement ecarte, pour la
     * meme raison qu'Intl.NumberFormat l'est cote TypeScript : selon la
     * version d'ICU il produit une espace insecable (U+00A0) ou fine
     * insecable (U+202F). Ces caracteres cassent les exports CSV, s'affichent
     * en carre dans certains PDF, et rendraient les tests dependants de la
     * machine. Ici, intl n'est meme pas installe.
     */
    private static function grouperMilliers(int $entier): string
    {
        return (string) preg_replace('/\B(?=(\d{3})+(?!\d))/', ' ', (string) $entier);
    }

    /**
     * Affichage francais : "1 234 567,89 Ar".
     * Partie entiere et partie decimale sont formatees separement : recomposer
     * un flottant "1234567.89" juste pour l'afficher rouvrirait la porte que
     * parseMontant a fermee.
     */
    public static function formaterAriary(int $centimes, string $devise = 'Ar'): string
    {
        $signe = $centimes < 0 ? '-' : '';
        $absolu = abs($centimes);
        $entier = intdiv($absolu, self::CENTIMES_PAR_ARIARY);
        $reste = $absolu % self::CENTIMES_PAR_ARIARY;

        return $signe
            . self::grouperMilliers($entier)
            . ','
            . str_pad((string) $reste, 2, '0', STR_PAD_LEFT)
            . ' '
            . $devise;
    }
}
