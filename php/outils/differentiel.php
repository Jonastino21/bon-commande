<?php

declare(strict_types=1);

/**
 * Cote PHP du test differentiel. Produit exactement le meme format que
 * outils/differentiel.ts, sur les memes donnees, dans le meme ordre.
 *
 * Usage : php outils/differentiel.php <export.json> <sortie.txt>
 */

require __DIR__ . '/../vendor/autoload.php';

use App\Domaine\Monnaie;
use App\Domaine\Texte;
use App\Import\Extraction;
use App\Import\Lots;
use App\Import\SchemaExport;

mb_internal_encoding('UTF-8');

const CHAMPS_MONTANT = ['tarifProp', 'remise', 'tarifApp', 'remise2', 'ajustement', 'tarifFinale'];
const CHAMPS_TEXTE = [
    'nomCatalogue',
    'famille',
    'designActeur',
    'codeActeur',
    'assoc__produit__3107',
    'assoc__produit__3571',
    'assoc__produit__762',
    'assoc__produit__3289',
    'assoc__produit__3045',
    'assoc__produit__327',
];

/** Date fixe : parseDateAAMMJJ refuse le futur, le verdict doit etre reproductible. */
$aujourdhui = new DateTimeImmutable('2026-09-16T00:00:00', new DateTimeZone('UTC'));

$n = static function ($valeur): string {
    return $valeur === null ? '' : (string) $valeur;
};
$s = static function (?string $valeur): string {
    return $valeur ?? '';
};
$b = static function (bool $valeur): string {
    return $valeur ? '1' : '0';
};
/** Arrondi au demi superieur, comme Math.round de JavaScript. */
$arrondi = static function (float $valeur): int {
    return (int) floor($valeur + 0.5);
};

$chemin = $argv[1] ?? '';
$sortie = $argv[2] ?? '';

$donnees = json_decode(file_get_contents($chemin), true, 512, JSON_THROW_ON_ERROR);
$lignes = $donnees['rows'];

$rapport = [];

// --- Domaine, champ par champ -----------------------------------------------
foreach ($lignes as $index => $ligne) {
    foreach (CHAMPS_MONTANT as $champ) {
        $resultat = Monnaie::parseMontant($ligne[$champ] ?? null);
        $rendu = $resultat->estValide()
            ? "OK\t" . $resultat->centimes() . "\t" . ($resultat->decimalesTronquees() ? 1 : 0)
            : "KO\t" . $resultat->raison() . "\t-";
        $rapport[] = "$index\tM\t$champ\t$rendu";
    }

    foreach (CHAMPS_TEXTE as $champ) {
        if (!array_key_exists($champ, $ligne)) {
            continue;
        }
        $r = Texte::nettoyerLibelle($ligne[$champ]);
        $rapport[] = "$index\tT\t$champ\t" . $r->valeur()
            . "\t" . ($r->mojibakeRepare() ? 1 : 0)
            . "\t" . ($r->perteEncodage() ? 1 : 0)
            . "\t" . ($r->espacesNormalises() ? 1 : 0)
            . "\t" . Texte::normaliserPourRecherche($r->valeur());
    }
}

// --- Validation de l'enveloppe ----------------------------------------------
$validation = SchemaExport::validerFichier($donnees);
if ($validation->estValide()) {
    $rapport[] = "V\tOK\t" . count($validation->avertissements());
    foreach ($validation->avertissements() as $avertissement) {
        $rapport[] = "V\tAVERT\t$avertissement";
    }
} else {
    foreach ($validation->problemes() as $probleme) {
        $rapport[] = "V\tKO\t" . $probleme['chemin'] . "\t" . $probleme['message'];
    }
}

// --- Extraction --------------------------------------------------------------
$extraction = Extraction::extraire($lignes, $aujourdhui);

$rapport[] = "X\tREJETEES\t" . $extraction->lignesRejetees;
$rapport[] = "X\tTOTAUX\t" . count($extraction->produits) . "\t" . count($extraction->tiers)
    . "\t" . count($extraction->tarifs) . "\t" . count($extraction->anomalies);

foreach ($extraction->produits as $p) {
    $rapport[] = "X\tPRODUIT\t" . $p->sourceProduitId . "\t" . $p->nom . "\t" . $p->nomNormalise
        . "\t" . $s($p->codeProduitA) . "\t" . $s($p->codeProduitN) . "\t" . $s($p->famille)
        . "\t" . $b($p->aPhoto) . "\t" . $p->nombreTarifs;
}

foreach ($extraction->tiers as $t) {
    $rapport[] = "X\tTIERS\t" . $t->sourceTiersId . "\t" . $s($t->code) . "\t" . $t->qualite
        . "\t" . $s($t->qualiteBrute) . "\t" . $t->nombreTarifs;
}

foreach ($extraction->tarifs as $t) {
    $rapport[] = "X\tTARIF\t" . $t->sourceLigneId . "\t" . $n($t->sourceProduitId)
        . "\t" . $n($t->sourceTiersId) . "\t" . $s($t->designationLibre)
        . "\t" . $s($t->designationNormalisee) . "\t" . $s($t->codeChezTiers)
        . "\t" . $n($t->prixCentimes) . "\t" . $n($t->prixLuCentimes) . "\t" . $t->echelle
        . "\t" . $b($t->echelleCorrigee) . "\t" . $b($t->echelleIncertaine)
        . "\t" . $s($t->dateTarif) . "\t" . $s($t->etatBrut) . "\t" . $b($t->actif)
        . "\t" . $s($t->societe);
}

foreach ($extraction->anomalies as $a) {
    $rapport[] = "X\tANOMALIE\t" . $a->type . "\t" . $n($a->ligneId) . "\t" . $a->detail;
}

// --- Lots de saisie ----------------------------------------------------------
$lots = Lots::construireLots($extraction->tarifs);
foreach ($lots as $lot) {
    $rapport[] = "L\t" . $lot->id . "\t" . $n($lot->sourceTiersId) . "\t" . $lot->premierLigneId
        . "\t" . $lot->dernierLigneId . "\t" . count($lot->tarifs)
        . "\t" . $arrondi($lot->medianeAriary * 200)
        . "\t" . $arrondi($lot->minAriary * 100) . "\t" . $arrondi($lot->maxAriary * 100)
        . "\t" . $lot->nombreIncertains . "\t" . $lot->nombreCorriges
        . "\t" . $b($lot->demandeArbitrage) . "\t" . $b($lot->echellesMelangees);
}

$synthese = Lots::synthetiserLots($lots);
$rapport[] = "S\t" . $synthese['nombreLots'] . "\t" . $synthese['lotsHomogenes']
    . "\t" . $synthese['lotsMelanges'] . "\t" . $synthese['lotsADemanderArbitrage']
    . "\t" . $synthese['lignesAArbitrer'];

file_put_contents($sortie, implode("\n", $rapport) . "\n");
echo 'PHP        : ' . count($rapport) . " lignes de rapport\n";
