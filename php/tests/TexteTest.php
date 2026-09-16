<?php

declare(strict_types=1);

namespace Tests;

use App\Domaine\Texte;
use PHPUnit\Framework\TestCase;

/** Portage de tests/texte.test.ts. */
final class TexteTest extends TestCase
{
    /**
     * Test d'aller-retour : on FABRIQUE le degat a partir du libelle correct,
     * puis on verifie qu'il est repare a l'identique.
     *
     * Recopier a la main des chaines deja abimees est le piege de ce module :
     * une espace insecable transcrite en espace ordinaire, et le cas ne teste
     * plus rien tout en paraissant valide. La fabrication supprime ce risque.
     *
     * @dataProvider libellesDuFichierKa
     */
    public function testRestaureLesLibellesDoublementEncodes(string $correct): void
    {
        $abime = Texte::fabriquerMojibake($correct);

        self::assertNotSame($correct, $abime, 'le cas de test ne produit aucun degat');

        $reparation = Texte::reparerMojibake($abime);

        self::assertSame($correct, $reparation['valeur']);
        self::assertTrue($reparation['repare']);
    }

    /** @return array<string, array{string}> */
    public function libellesDuFichierKa(): array
    {
        return [
            'accent simple'      => ["HOMEOPULMINE Flc de 30 comprim\u{00E9}s"],
            'accent isole'       => ["gal\u{00E9}rie photo"],
            'espace insecable'   => ["brosse \u{00E0} linge"],
            // 0x9C : la ou un decodage Latin-1 echouerait.
            'ligature oe'        => ["Nutri-04-C\u{0153}ur Comprim\u{00E9}s"],
            // 0x92 : apostrophe typographique.
            'apostrophe typo'    => ["d\u{2019}extincteur 2kg"],
            'plan evacuation'    => ["Plan d\u{2019}\u{00E9}vacuation+cadre (A3)"],
            'exposant'           => ["Mise au rebut en d\u{00E9}charge agr\u{00E9}\u{00E9}e CO\u{00B2}"],
        ];
    }

    /**
     * Le cas le plus delicat : une chaine partiellement abimee. Les accents
     * deja corrects doivent survivre, seul l'exposant est deguise. Decoder la
     * chaine entiere d'un bloc detruirait la partie saine.
     */
    public function testRepareUnMojibakePartielSansAbimerLaPartieDejaCorrecte(): void
    {
        $partiel = "Mise au rebut en d\u{00E9}charge agr\u{00E9}\u{00E9}e "
            . Texte::fabriquerMojibake("CO\u{00B2}");

        $reparation = Texte::reparerMojibake($partiel);

        self::assertSame("Mise au rebut en d\u{00E9}charge agr\u{00E9}\u{00E9}e CO\u{00B2}", $reparation['valeur']);
        self::assertTrue($reparation['repare']);
    }

    /** @dataProvider textesSains */
    public function testLaisseIntactUnTexteDejaCorrect(string $texte): void
    {
        $reparation = Texte::reparerMojibake($texte);

        self::assertSame($texte, $reparation['valeur']);
        self::assertFalse($reparation['repare']);
    }

    /** @return array<string, array{string}> */
    public function textesSains(): array
    {
        return [
            'accentue correct' => ["brosse \u{00E0} linge"],
            'sans accent'      => ['ciment 50 kg cpa 42.5'],
            'avec etoile'      => ['pave calcaire blanc 150*200'],
            'chiffres'         => ['Nutri-04 250 mg'],
        ];
    }

    /** @dataProvider pertes */
    public function testDetecteCeQuiNEstPlusRestaurable(string $texte, bool $attendu): void
    {
        self::assertSame($attendu, Texte::aPerteEncodage($texte));
    }

    /** @return array<string, array{string, bool}> */
    public function pertes(): array
    {
        return [
            'quatre points d interrogation' => ['????', true],
            'caractere de remplacement'     => ["caf\u{FFFD}", true],
            'parenthese et exclamation'     => ['bajg (kampo) !', false],
            'une seule interrogation'       => ['ciment ?', false],
            'deux interrogations'           => ['ciment ??', false],
        ];
    }

    /** @dataProvider espaces */
    public function testReduitLesEspacesParasites(string $brut, string $attendu): void
    {
        self::assertSame($attendu, Texte::normaliserEspaces($brut));
    }

    /** @return array<string, array{string, string}> */
    public function espaces(): array
    {
        return [
            'espace double' => ['Creation d un  calendrier ', 'Creation d un calendrier'],
            'bords'         => ['  Baum  ', 'Baum'],
            'insecable'     => ["Mise\u{00A0}a disposition", 'Mise a disposition'],
            'tabulation'    => ["ciment\t50 kg", 'ciment 50 kg'],
        ];
    }

    public function testEnchaineReparationEtNormalisation(): void
    {
        $abime = Texte::fabriquerMojibake("HOMEOGASTRINE Flc de 30 comprim\u{00E9}s");

        $resultat = Texte::nettoyerLibelle($abime);

        self::assertSame("HOMEOGASTRINE Flc de 30 comprim\u{00E9}s", $resultat->valeur());
        self::assertTrue($resultat->mojibakeRepare());
        self::assertFalse($resultat->perteEncodage());
    }

    public function testSignaleUnePerteSansPretendreLAvoirReparee(): void
    {
        $resultat = Texte::nettoyerLibelle('????');

        self::assertSame('????', $resultat->valeur());
        self::assertTrue($resultat->perteEncodage());
        self::assertFalse($resultat->mojibakeRepare());
    }

    public function testAccepteLesValeursAbsentes(): void
    {
        self::assertSame('', Texte::nettoyerLibelle(null)->valeur());
        self::assertSame('', Texte::nettoyerLibelle('')->valeur());
    }

    /** @dataProvider recherches */
    public function testRendLaRechercheInsensibleAuxAccentsEtALaCasse(
        string $brut,
        string $attendu
    ): void {
        self::assertSame($attendu, Texte::normaliserPourRecherche($brut));
    }

    /** @return array<string, array{string, string}> */
    public function recherches(): array
    {
        return [
            'accents'   => ["gal\u{00E9}rie photo", 'galerie photo'],
            'casse'     => ["Comprim\u{00E9}s", 'comprimes'],
            'ligature'  => ["Nutri-04-C\u{0153}ur", 'nutri 04 coeur'],
            'cedille'   => ["d\u{00E9}pla\u{00E7}ement", 'deplacement'],
            'ponctuation' => ["R\u{00E9}alisation d'un site", 'realisation d un site'],
            'etoile'    => ['pave 150*200', 'pave 150 200'],
        ];
    }

    /**
     * Le point qui justifie tout le module cote recherche : une saisie sans
     * accent doit retrouver un libelle accentue.
     */
    public function testUneSaisieSansAccentRetrouveUnLibelleAccentue(): void
    {
        self::assertSame(
            Texte::normaliserPourRecherche('comprimes'),
            Texte::normaliserPourRecherche("comprim\u{00E9}s")
        );
    }
}
