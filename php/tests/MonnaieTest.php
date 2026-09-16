<?php

declare(strict_types=1);

namespace Tests;

use App\Domaine\Monnaie;
use App\Domaine\ResultatMontant;
use InvalidArgumentException;
use LogicException;
use PHPUnit\Framework\TestCase;

/** Portage de tests/monnaie.test.ts. */
final class MonnaieTest extends TestCase
{
    /** @dataProvider formatsDeLExport */
    public function testConvertitLesFormatsPresentsDansLExport(string $brut, int $attendu): void
    {
        $resultat = Monnaie::parseMontant($brut);

        self::assertTrue($resultat->estValide(), "« $brut » aurait du etre accepte");
        self::assertSame($attendu, $resultat->centimes());
    }

    /** @return array<string, array{string, int}> */
    public function formatsDeLExport(): array
    {
        return [
            '34400.00'    => ['34400.00', 3440000],
            '8.50'        => ['8.50', 850],
            '0.10'        => ['0.10', 10],
            '12500000.00' => ['12500000.00', 1250000000],
            '28166.67'    => ['28166.67', 2816667],
            '6666.67'     => ['6666.67', 666667],
            '5833.34'     => ['5833.34', 583334],
            '1408.75'     => ['1408.75', 140875],
            'virgule et espaces' => ['1 234,56', 123456],
            'sans decimale'      => ['80', 8000],
            'une decimale'       => ['80.5', 8050],
        ];
    }

    /**
     * Les quatre valeurs qui cassent REELLEMENT la multiplication flottante.
     * Le test se fait en deux temps : d'abord la preuve que le piege existe
     * dans ce PHP-ci, ensuite la preuve que parseMontant y echappe.
     *
     * Sans ce test, quelqu'un peut remplacer le decoupage textuel par un
     * (int) round((float) $x * 100), voir tous les autres tests passer au
     * vert, et expedier des bons de commande amputes d'un centime par ligne.
     *
     * @dataProvider valeursQuiPiegentLeFlottant
     */
    public function testLesValeursOuLaMultiplicationFlottantePerdUnCentime(
        string $brut,
        int $centimesAttendus
    ): void {
        self::assertSame(
            $centimesAttendus - 1,
            (int) ((float) $brut * 100),
            "le piege du flottant a disparu pour « $brut » : ce test est a revoir"
        );

        self::assertSame($centimesAttendus, Monnaie::parseMontant($brut)->centimes());
    }

    /** @return array<string, array{string, int}> */
    public function valeursQuiPiegentLeFlottant(): array
    {
        return [
            '0.29' => ['0.29', 29],
            '1.15' => ['1.15', 115],
            '4.35' => ['4.35', 435],
            '8.20' => ['8.20', 820],
        ];
    }

    public function testSignaleUneTroncatureAuLieuDeLAppliquerEnSilence(): void
    {
        $resultat = Monnaie::parseMontant('10.999');

        self::assertSame(1099, $resultat->centimes());
        self::assertTrue($resultat->decimalesTronquees());
    }

    public function testNeSignalePasDeTroncatureQuandIlNYEnAPas(): void
    {
        self::assertFalse(Monnaie::parseMontant('10.99')->decimalesTronquees());
    }

    /** @dataProvider valeursRefusees */
    public function testRefuseCeQuiNEstPasUnMontant($brut, string $raison): void
    {
        $resultat = Monnaie::parseMontant($brut);

        self::assertFalse($resultat->estValide());
        self::assertSame($raison, $resultat->raison());
    }

    /** @return array<string, array{mixed, string}> */
    public function valeursRefusees(): array
    {
        return [
            'chaine vide' => ['', ResultatMontant::VIDE],
            'null'        => [null, ResultatMontant::VIDE],
            'N/A'         => ['N/A', ResultatMontant::NON_NUMERIQUE],
            'deux points' => ['12.5.3', ResultatMontant::NON_NUMERIQUE],
            'negatif'     => ['-5.00', ResultatMontant::NEGATIF],
            'aberrant'    => ['99999999999', ResultatMontant::HORS_LIMITES],
        ];
    }

    /**
     * La garde qui remplace l'union discriminee du TypeScript : lire les
     * centimes d'un montant invalide doit exploser, pas renvoyer zero.
     */
    public function testLireUnMontantInvalideLeveUneException(): void
    {
        $this->expectException(LogicException::class);
        Monnaie::parseMontant('N/A')->centimes();
    }

    /**
     * Un depassement d'entier 64 bits ne doit jamais basculer en flottant :
     * il doit etre refuse sur la longueur du texte, avant tout calcul.
     */
    public function testRefuseUnNombreQuiDepasseraitLEntier64Bits(): void
    {
        $resultat = Monnaie::parseMontant('999999999999999999999999.00');

        self::assertFalse($resultat->estValide());
        self::assertSame(ResultatMontant::HORS_LIMITES, $resultat->raison());
    }

    /** @dataProvider echelles */
    public function testRangeLesValeursDuBonCote(int $centimes, string $attendu): void
    {
        self::assertSame($attendu, Monnaie::classerEchelle($centimes));
    }

    /** @return array<string, array{int, string}> */
    public function echelles(): array
    {
        return [
            '8,50 Ar'     => [850, Monnaie::ECHELLE_MILLIERS_CERTAIN],
            '17,60 Ar'    => [1760, Monnaie::ECHELLE_MILLIERS_CERTAIN],
            '34 400 Ar'   => [3440000, Monnaie::ECHELLE_ARIARY_CERTAIN],
            '203 Ar'      => [20300, Monnaie::ECHELLE_A_ARBITRER],
            '200 Ar'      => [20000, Monnaie::ECHELLE_A_ARBITRER],
            '2 200 Ar'    => [220000, Monnaie::ECHELLE_A_ARBITRER],
            'borne 99,99' => [9999, Monnaie::ECHELLE_MILLIERS_CERTAIN],
            'borne 100'   => [10000, Monnaie::ECHELLE_A_ARBITRER],
            'borne 2999,99' => [299999, Monnaie::ECHELLE_A_ARBITRER],
            'borne 3000'    => [300000, Monnaie::ECHELLE_ARIARY_CERTAIN],
        ];
    }

    public function testCorrigerMilliersTransforme850EnHuitMilleCinqCents(): void
    {
        self::assertSame(850000, Monnaie::corrigerMilliers(850));
        self::assertSame('8 500,00 Ar', Monnaie::formaterAriary(Monnaie::corrigerMilliers(850)));
    }

    public function testCalculeUnSousTotalSurQuantiteEntiere(): void
    {
        self::assertSame(
            13500000,
            Monnaie::sousTotal(4500000, Monnaie::quantiteEnMilliemes(3.0))
        );
    }

    public function testGereLesQuantitesDecimalesDesUnitesAuPoids(): void
    {
        $sousTotal = Monnaie::sousTotal(850000, Monnaie::quantiteEnMilliemes(2.5));

        self::assertSame(2125000, $sousTotal);
        self::assertSame('21 250,00 Ar', Monnaie::formaterAriary($sousTotal));
    }

    /**
     * L'arrondi entier doit se faire au demi superieur, comme Math.round.
     * 333 centimes x 0,001 unite = 0,333 centime -> 0 ; x 0,0015 -> 1.
     */
    public function testArrondiEntierAuDemiSuperieur(): void
    {
        self::assertSame(0, Monnaie::sousTotal(333, 1));
        self::assertSame(1, Monnaie::sousTotal(1000, 1));
        self::assertSame(1, Monnaie::sousTotal(500, 1));
        self::assertSame(0, Monnaie::sousTotal(499, 1));
    }

    public function testRefuseUneQuantiteNegative(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Monnaie::sousTotal(1000, -1);
    }

    public function testTotalGeneral(): void
    {
        self::assertSame(0, Monnaie::totalGeneral([]));
        self::assertSame(6000000, Monnaie::totalGeneral([1000000, 2000000, 3000000]));
    }

    /** @dataProvider affichages */
    public function testAffichageFrancais(int $centimes, string $attendu): void
    {
        self::assertSame($attendu, Monnaie::formaterAriary($centimes));
    }

    /** @return array<string, array{int, string}> */
    public function affichages(): array
    {
        return [
            'zero'          => [0, '0,00 Ar'],
            'centimes seuls' => [7, '0,07 Ar'],
            'sans groupe'   => [85000, '850,00 Ar'],
            'un groupe'     => [123456, '1 234,56 Ar'],
            'trois groupes' => [123456789, '1 234 567,89 Ar'],
            'negatif'       => [-123456, '-1 234,56 Ar'],
        ];
    }

    /**
     * L'espace de groupement doit etre une espace ORDINAIRE (U+0020).
     * Une insecable casserait les exports CSV et s'afficherait en carre dans
     * certains PDF : c'est la raison pour laquelle intl est ecarte.
     */
    public function testLEspaceDeGroupementEstOrdinaire(): void
    {
        self::assertSame(
            "1\u{0020}234,56 Ar",
            Monnaie::formaterAriary(123456)
        );
        self::assertStringNotContainsString("\u{00A0}", Monnaie::formaterAriary(123456789));
        self::assertStringNotContainsString("\u{202F}", Monnaie::formaterAriary(123456789));
    }

    /**
     * Le format d'affichage doit survivre a l'aller-retour : ce qui est
     * affiche doit pouvoir etre relu sans perdre un centime.
     *
     * @dataProvider formatsDeLExport
     */
    public function testAllerRetourAffichageRelecture(string $brut, int $attendu): void
    {
        $affiche = Monnaie::formaterAriary($attendu, '');
        $relu = Monnaie::parseMontant(str_replace(',', '.', trim($affiche)));

        self::assertSame($attendu, $relu->centimes(), "aller-retour casse pour « $brut »");
    }
}
