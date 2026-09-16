<?php

declare(strict_types=1);

namespace App\Domaine;

/**
 * Nettoyage des libelles issus de Verif K7. Portage de src/domaine/texte.ts.
 *
 * L'export contient deux degats d'encodage distincts, qu'il ne faut pas
 * confondre :
 *
 *  - le mojibake REPARABLE : du texte UTF-8 relu comme du Windows-1252 puis
 *    re-encode en UTF-8 ("comprimAcs"). L'information est intacte, seulement
 *    mal habillee : on peut la restaurer exactement.
 *  - la perte IRREVERSIBLE : les caracteres ont ete remplaces par "?" ou par
 *    le caractere de remplacement Unicode. L'original n'existe plus nulle
 *    part, aucun code ne peut l'inventer ; on se contente de signaler.
 */
final class Texte
{
    private const REMPLACEMENT_UNICODE = "\u{FFFD}";

    /**
     * Table inverse de Windows-1252 pour la plage 0x80-0x9F.
     *
     * C'est le detail qui decide de la reussite de la reparation. Le texte a
     * ete relu par le portail comme du Windows-1252, PAS comme du Latin-1 :
     * dans cette plage les deux encodages divergent completement. Sans cette
     * table, "Nutri-04-CEur" (ou l'octet 0x9C porte le "oe" ligature) reste
     * irreparable, et l'apostrophe typographique aussi.
     *
     * Les caracteres sont ecrits en echappement \u{} plutot qu'en clair :
     * un copier-coller a travers un editeur mal configure suffirait sinon a
     * corrompre la table censee reparer la corruption.
     *
     * @return array<string, int>
     */
    private static function octetsWindows1252(): array
    {
        static $table = null;

        if ($table === null) {
            $table = [
                "\u{20AC}" => 0x80, "\u{201A}" => 0x82, "\u{0192}" => 0x83,
                "\u{201E}" => 0x84, "\u{2026}" => 0x85, "\u{2020}" => 0x86,
                "\u{2021}" => 0x87, "\u{02C6}" => 0x88, "\u{2030}" => 0x89,
                "\u{0160}" => 0x8A, "\u{2039}" => 0x8B, "\u{0152}" => 0x8C,
                "\u{017D}" => 0x8E, "\u{2018}" => 0x91, "\u{2019}" => 0x92,
                "\u{201C}" => 0x93, "\u{201D}" => 0x94, "\u{2022}" => 0x95,
                "\u{2013}" => 0x96, "\u{2014}" => 0x97, "\u{02DC}" => 0x98,
                "\u{2122}" => 0x99, "\u{0161}" => 0x9A, "\u{203A}" => 0x9B,
                "\u{0153}" => 0x9C, "\u{017E}" => 0x9E, "\u{0178}" => 0x9F,
            ];
        }

        return $table;
    }

    /** Octet d'origine d'un caractere, s'il peut provenir d'un octet unique. */
    private static function versOctet(string $caractere): ?int
    {
        if ($caractere === '') {
            return null;
        }

        $code = mb_ord($caractere, 'UTF-8');
        if ($code === false) {
            return null;
        }
        if ($code <= 0xFF) {
            return $code;
        }

        return self::octetsWindows1252()[$caractere] ?? null;
    }

    /** Nombre d'octets d'une sequence UTF-8 d'apres son octet de tete. */
    private static function longueurSequence(int $octet): ?int
    {
        if ($octet >= 0xC2 && $octet <= 0xDF) {
            return 2;
        }
        if ($octet >= 0xE0 && $octet <= 0xEF) {
            return 3;
        }
        if ($octet >= 0xF0 && $octet <= 0xF4) {
            return 4;
        }

        return null;
    }

    /**
     * Tente de lire, a partir de $debut, une sequence UTF-8 deguisee en
     * caracteres Windows-1252. Renvoie null des que le moindre element ne
     * colle pas : mieux vaut laisser un caractere douteux intact que
     * produire du bruit.
     *
     * @param string[] $chars
     * @return array{caractere: string, longueur: int}|null
     */
    private static function decoderSequence(array $chars, int $debut, int $total): ?array
    {
        $tete = self::versOctet($chars[$debut] ?? '');
        if ($tete === null) {
            return null;
        }

        $longueur = self::longueurSequence($tete);
        if ($longueur === null || $debut + $longueur > $total) {
            return null;
        }

        $octets = [$tete];
        for ($decalage = 1; $decalage < $longueur; $decalage++) {
            $suite = self::versOctet($chars[$debut + $decalage] ?? '');
            if ($suite === null || $suite < 0x80 || $suite > 0xBF) {
                return null;
            }
            $octets[] = $suite;
        }

        $decode = '';
        foreach ($octets as $octet) {
            $decode .= chr($octet);
        }

        // mb_check_encoding joue ici le role du caractere de remplacement
        // cote Node : il refuse une sequence qui ne forme pas de l'UTF-8.
        if (!mb_check_encoding($decode, 'UTF-8')) {
            return null;
        }

        return ['caractere' => $decode, 'longueur' => $longueur];
    }

    /**
     * Defait un double encodage UTF-8, sequence par sequence.
     *
     * Le traitement est local et non global : une chaine peut etre
     * partiellement abimee ("decharge agreee ... CO2"), ou les accents sont
     * deja corrects et seul l'exposant est deguise. Decoder la chaine entiere
     * d'un bloc detruirait la partie saine ; on ne touche donc qu'aux
     * sequences qui se decodent vraiment.
     *
     * @return array{valeur: string, repare: bool}
     */
    public static function reparerMojibake(string $texte): array
    {
        $chars = mb_str_split($texte, 1, 'UTF-8');
        $total = count($chars);

        $resultat = '';
        $position = 0;
        $repare = false;

        while ($position < $total) {
            $sequence = self::decoderSequence($chars, $position, $total);
            if ($sequence !== null) {
                $resultat .= $sequence['caractere'];
                $position += $sequence['longueur'];
                $repare = true;
            } else {
                $resultat .= $chars[$position];
                $position += 1;
            }
        }

        return ['valeur' => $resultat, 'repare' => $repare];
    }

    /** Detecte une perte d'information que rien ne pourra restaurer. */
    public static function aPerteEncodage(string $texte): bool
    {
        return strpos($texte, self::REMPLACEMENT_UNICODE) !== false
            || preg_match('/\?{3,}/', $texte) === 1;
    }

    /** Espaces insecables, tabulations, espaces multiples, bords. */
    public static function normaliserEspaces(string $texte): string
    {
        return trim((string) preg_replace('/[\s\x{00A0}]+/u', ' ', $texte));
    }

    /** Pipeline complet applique a chaque libelle importe. */
    public static function nettoyerLibelle($brut): ResultatTexte
    {
        $origine = $brut === null ? '' : (string) $brut;
        $reparation = self::reparerMojibake($origine);
        $valeur = self::normaliserEspaces($reparation['valeur']);

        return new ResultatTexte(
            $valeur,
            $reparation['repare'],
            self::aPerteEncodage($valeur),
            $valeur !== $reparation['valeur']
        );
    }

    /**
     * Depouillement des accents sans l'extension intl.
     *
     * Normalizer::normalize(FORM_D) ferait le travail, mais intl n'est pas
     * garanti sur l'hebergement mutualise, et iconv //TRANSLIT depend de la
     * libc : selon la machine, "e" devient "e", "'e" ou "?". Une table
     * explicite donne le meme resultat partout. C'est le meme raisonnement
     * qui a fait ecarter Intl.NumberFormat cote TypeScript.
     */
    private const SANS_ACCENT = [
        "\u{00E0}" => 'a', "\u{00E1}" => 'a', "\u{00E2}" => 'a', "\u{00E3}" => 'a',
        "\u{00E4}" => 'a', "\u{00E5}" => 'a', "\u{0101}" => 'a',
        "\u{00E8}" => 'e', "\u{00E9}" => 'e', "\u{00EA}" => 'e', "\u{00EB}" => 'e',
        "\u{0113}" => 'e',
        "\u{00EC}" => 'i', "\u{00ED}" => 'i', "\u{00EE}" => 'i', "\u{00EF}" => 'i',
        "\u{012B}" => 'i',
        "\u{00F2}" => 'o', "\u{00F3}" => 'o', "\u{00F4}" => 'o', "\u{00F5}" => 'o',
        "\u{00F6}" => 'o', "\u{014D}" => 'o',
        "\u{00F9}" => 'u', "\u{00FA}" => 'u', "\u{00FB}" => 'u', "\u{00FC}" => 'u',
        "\u{016B}" => 'u',
        "\u{00E7}" => 'c', "\u{00F1}" => 'n', "\u{00FD}" => 'y', "\u{00FF}" => 'y',
        "\u{0153}" => 'oe', "\u{00E6}" => 'ae', "\u{00DF}" => 'ss',
    ];

    /**
     * Forme normalisee servant a la recherche et au rapprochement de produits :
     * minuscules, sans accent, sans ponctuation parasite, espaces reduits.
     * C'est cette valeur qui alimente l'index de recherche, pour qu'une saisie
     * "galerie photo" retrouve "galerie photo" accentue.
     */
    public static function normaliserPourRecherche(string $texte): string
    {
        $minuscule = mb_strtolower($texte, 'UTF-8');
        $sansAccent = strtr($minuscule, self::SANS_ACCENT);

        return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $sansAccent));
    }

    /**
     * Transformation INVERSE : fabrique le mojibake a partir du texte correct.
     * Chaque octet UTF-8 est re-habille en son caractere Windows-1252.
     *
     * Utilitaire de test, pas de production. Il permet d'ecrire des cas
     * d'aller-retour plutot que de recopier a la main des chaines abimees,
     * ou une seule espace insecable mal transcrite fausserait le verdict.
     */
    public static function fabriquerMojibake(string $texte): string
    {
        $versCaractere = array_flip(self::octetsWindows1252());
        $sortie = '';

        foreach (str_split($texte) as $octetBrut) {
            $octet = ord($octetBrut);
            $sortie .= $versCaractere[$octet] ?? mb_chr($octet, 'UTF-8');
        }

        return $sortie;
    }
}
