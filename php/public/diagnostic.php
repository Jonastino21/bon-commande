<?php

declare(strict_types=1);

/**
 * Diagnostic d'hebergement pour Verif Achats.
 *
 * A DEPOSER SUR LE SOUS-DOMAINE, OUVRIR DANS UN NAVIGATEUR, PUIS SUPPRIMER.
 *
 * Ce fichier repond a une seule question : est-ce que le portage PHP peut
 * tourner sur ce serveur ? Plutot que de lister des versions, il fait
 * REELLEMENT tourner le code du domaine (montants, encodage, recherche) et
 * verifie les resultats. Si tout est vert ici, le reste du portage n'a plus
 * de mauvaise surprise d'environnement a craindre.
 *
 * Il n'ecrit rien, ne se connecte a aucune base et n'a besoin d'aucune
 * dependance : ni Composer, ni Laravel.
 *
 * SECURITE : ce fichier expose la configuration du serveur. Il doit etre
 * supprime des que le diagnostic est lu.
 */

header('Content-Type: text/plain; charset=utf-8');

$racine = dirname(__DIR__);
foreach (['ResultatMontant', 'Monnaie', 'ResultatTexte', 'Texte'] as $classe) {
    $fichier = $racine . '/src/Domaine/' . $classe . '.php';
    if (!is_file($fichier)) {
        echo "ARRET : fichier introuvable -> $fichier\n";
        echo "Deposez le dossier src/ a cote de public/.\n";
        exit(1);
    }
    require_once $fichier;
}

use App\Domaine\Monnaie;
use App\Domaine\Texte;

$echecs = 0;
$avertissements = 0;

function titre(string $texte): void
{
    echo "\n" . $texte . "\n" . str_repeat('-', strlen($texte)) . "\n";
}

function verifier(string $libelle, bool $condition, string $detail = ''): void
{
    global $echecs;
    if (!$condition) {
        $echecs++;
    }
    printf("  [%s] %-42s %s\n", $condition ? 'OK' : 'KO', $libelle, $detail);
}

function avertir(string $libelle, bool $condition, string $detail = ''): void
{
    global $avertissements;
    if (!$condition) {
        $avertissements++;
    }
    printf("  [%s] %-42s %s\n", $condition ? 'OK' : '??', $libelle, $detail);
}

echo "DIAGNOSTIC VERIF ACHATS\n";
echo str_repeat('=', 60) . "\n";
echo '  ' . date('Y-m-d H:i:s') . '  sur ' . php_uname('n') . "\n";

/* ------------------------------------------------------------------ */
titre('PHP');

$version = PHP_VERSION;
verifier('Version >= 8.2 (requis par Laravel 12)', version_compare($version, '8.2.0', '>='), $version);
verifier('Entiers 64 bits', PHP_INT_SIZE === 8, PHP_INT_MAX . ' max');
echo "       (le plafond metier est de 1e11 centimes : large marge)\n";

/* ------------------------------------------------------------------ */
titre('EXTENSIONS INDISPENSABLES');

foreach (['mbstring', 'pdo_mysql', 'openssl', 'tokenizer', 'ctype', 'fileinfo', 'json', 'xml'] as $extension) {
    verifier($extension, extension_loaded($extension));
}

titre('EXTENSIONS OPTIONNELLES');
avertir('bcmath', extension_loaded('bcmath'), 'utile si les montants depassent 64 bits');
avertir('intl', extension_loaded('intl'), 'NON requis : le code s en passe volontairement');
avertir('zip', extension_loaded('zip'), 'accelere Composer');

/* ------------------------------------------------------------------ */
titre('MONTANTS — le code reel tourne ici');

foreach ([
    ['34400.00', 3440000],
    ['8.50', 850],
    ['1 234,56', 123456],
    ['28166.67', 2816667],
] as [$brut, $attendu]) {
    $obtenu = Monnaie::parseMontant($brut)->centimes();
    verifier("parseMontant('$brut')", $obtenu === $attendu, "= $obtenu");
}

echo "\n  Les valeurs qui piegent la multiplication flottante :\n";
foreach ([['0.29', 29], ['1.15', 115], ['4.35', 435], ['8.20', 820]] as [$brut, $attendu]) {
    $naif = (int) ((float) $brut * 100);
    $exact = Monnaie::parseMontant($brut)->centimes();
    verifier(
        "  '$brut' : flottant=$naif, exact=$exact",
        $exact === $attendu && $naif === $attendu - 1
    );
}

verifier(
    'formaterAriary(123456789)',
    Monnaie::formaterAriary(123456789) === '1 234 567,89 Ar',
    Monnaie::formaterAriary(123456789)
);
verifier(
    'espace de groupement ordinaire (pas insecable)',
    strpos(Monnaie::formaterAriary(123456), "\u{00A0}") === false
);
verifier(
    'sousTotal 2,5 kg a 8 500 Ar',
    Monnaie::sousTotal(850000, Monnaie::quantiteEnMilliemes(2.5)) === 2125000
);

/* ------------------------------------------------------------------ */
titre('ENCODAGE — reparation du mojibake Verif K7');

foreach ([
    'accent'          => "HOMEOPULMINE Flc de 30 comprim\u{00E9}s",
    'espace insecable' => "brosse \u{00E0} linge",
    'ligature 0x9C'   => "Nutri-04-C\u{0153}ur Comprim\u{00E9}s",
    'apostrophe 0x92' => "d\u{2019}extincteur 2kg",
    'exposant'        => "d\u{00E9}charge agr\u{00E9}\u{00E9}e CO\u{00B2}",
] as $libelle => $correct) {
    $abime = Texte::fabriquerMojibake($correct);
    $repare = Texte::reparerMojibake($abime)['valeur'];
    verifier($libelle, $repare === $correct && $abime !== $correct, $repare);
}

verifier(
    'texte sain laisse intact',
    Texte::reparerMojibake("brosse \u{00E0} linge")['repare'] === false
);

/* ------------------------------------------------------------------ */
titre('RECHERCHE');

verifier(
    "'comprimes' retrouve 'comprimes' accentue",
    Texte::normaliserPourRecherche('comprimes') === Texte::normaliserPourRecherche("comprim\u{00E9}s")
);
verifier(
    "'coeur' retrouve la ligature (bug corrige)",
    Texte::normaliserPourRecherche("C\u{0153}ur") === 'coeur',
    Texte::normaliserPourRecherche("C\u{0153}ur")
);

/* ------------------------------------------------------------------ */
titre('SERVEUR WEB');

$racineDocument = $_SERVER['DOCUMENT_ROOT'] ?? '';
$surPublic = basename(rtrim($racineDocument, '/\\')) === 'public';
verifier(
    'Racine du document sur public/',
    $surPublic,
    $racineDocument
);
if (!$surPublic) {
    echo "\n       *** IMPORTANT ***\n";
    echo "       La racine doit pointer sur le dossier public/ de Laravel.\n";
    echo "       Sinon le fichier .env — donc le mot de passe MySQL et la\n";
    echo "       cle d'application — devient telechargeable par n'importe qui.\n";
    echo "       Plesk : Sites Web & Domaines > Hebergement > Racine du document\n\n";
}

verifier('HTTPS actif', !empty($_SERVER['HTTPS']) || ($_SERVER['SERVER_PORT'] ?? '') === '443');
avertir('Ecriture possible hors racine web', is_writable($racine), $racine);

$limite = (int) ini_get('memory_limit');
avertir('memory_limit >= 256M', $limite <= 0 || $limite >= 256, ini_get('memory_limit'));
avertir('max_execution_time >= 60s', (int) ini_get('max_execution_time') === 0 || (int) ini_get('max_execution_time') >= 60, ini_get('max_execution_time') . 's');
avertir('upload_max_filesize >= 8M pour l import JSON', (int) ini_get('upload_max_filesize') >= 8, ini_get('upload_max_filesize'));

$libre = @disk_free_space($racine);
if ($libre !== false) {
    echo sprintf("  [--] %-42s %.1f Go\n", 'Espace disque libre', $libre / 1073741824);
}

/* ------------------------------------------------------------------ */
titre('VERDICT');

if ($echecs === 0) {
    echo "  Aucun echec. Le portage PHP peut tourner sur ce serveur.\n";
} else {
    echo "  $echecs echec(s) : a regler avant d'aller plus loin.\n";
}
if ($avertissements > 0) {
    echo "  $avertissements point(s) a surveiller, sans gravite immediate.\n";
}

echo "\n  SUPPRIMEZ CE FICHIER une fois le diagnostic lu.\n";
