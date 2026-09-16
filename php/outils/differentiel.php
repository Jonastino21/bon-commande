<?php

declare(strict_types=1);

/**
 * Cote PHP du test differentiel. Produit exactement le meme format que
 * differentiel.ts, sur les memes donnees, dans le meme ordre.
 *
 * Usage : php outils/differentiel.php <export.json> <sortie.txt>
 *
 * Fichier de travail temporaire, a supprimer une fois le portage valide.
 */

require __DIR__ . '/../vendor/autoload.php';

use App\Domaine\Monnaie;
use App\Domaine\Texte;

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

$chemin = $argv[1] ?? '';
$sortie = $argv[2] ?? '';

$donnees = json_decode(file_get_contents($chemin), true, 512, JSON_THROW_ON_ERROR);
$lignes = $donnees['rows'];

$rapport = [];

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
        $recherche = Texte::normaliserPourRecherche($r->valeur());
        $rapport[] = "$index\tT\t$champ\t" . $r->valeur()
            . "\t" . ($r->mojibakeRepare() ? 1 : 0)
            . "\t" . ($r->perteEncodage() ? 1 : 0)
            . "\t" . ($r->espacesNormalises() ? 1 : 0)
            . "\t" . $recherche;
    }
}

file_put_contents($sortie, implode("\n", $rapport) . "\n");
echo 'PHP        : ' . count($rapport) . " lignes de rapport\n";
