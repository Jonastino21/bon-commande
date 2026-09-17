<?php

declare(strict_types=1);

namespace App\Import;

use App\Domaine\Dates;
use App\Domaine\Monnaie;
use App\Domaine\ResultatDate;
use App\Domaine\ResultatMontant;
use App\Domaine\Texte;
use DateTimeImmutable;

/**
 * Transformation des lignes brutes du module 21 en entites metier.
 * Portage de src/import/extraction.ts.
 *
 * Une ligne de l'export = un TARIF (un prix negocie entre un tiers et un
 * produit). Le produit et le tiers n'y figurent que par reference : on les
 * reconstitue par agregation, en gardant a l'esprit que ce module n'est pas
 * leur source de verite.
 *
 * Aucune donnee n'est jetee en silence. Tout ce qui est corrige, ignore ou
 * douteux ressort dans les anomalies, avec de quoi retrouver la ligne
 * d'origine.
 */
final class Extraction
{
    /** Noms des colonnes du module 21, isoles ici pour rester lisibles. */
    public const CHAMP_LIGNE_ID = 'id';
    public const CHAMP_PRODUIT_ID = 'assoc__produit__id';
    public const CHAMP_PRODUIT_NOM = 'assoc__produit__327';
    public const CHAMP_PRODUIT_CODE_A = 'assoc__produit__762';
    public const CHAMP_PRODUIT_CODE_N = 'assoc__produit__3289';
    public const CHAMP_TIERS_ID = 'assoc__client__id';
    public const CHAMP_TIERS_CODE = 'assoc__client__326';
    public const CHAMP_TIERS_QUALITE = 'assoc__client__3434';
    public const CHAMP_DESIGNATION_LIBRE = 'designActeur';
    public const CHAMP_CODE_CHEZ_TIERS = 'codeActeur';
    public const CHAMP_PRIX_FINAL = 'tarifFinale';
    public const CHAMP_FAMILLE = 'famille';
    public const CHAMP_ETAT = 'etat';
    public const CHAMP_DATE = 'date';
    public const CHAMP_SOCIETE = 'societeId';
    public const CHAMP_IMAGE = 'Image';

    /** @param array<int, array<string, mixed>> $lignes */
    public static function extraire(array $lignes, ?DateTimeImmutable $aujourdhui = null): ResultatExtraction
    {
        $anomalies = [];
        $tarifs = [];
        $produitsParId = [];
        $nomsParProduit = [];
        $tiersParId = [];
        $lignesVues = [];
        $lignesRejetees = 0;

        foreach ($lignes as $ligne) {
            $ligneId = self::entier($ligne[self::CHAMP_LIGNE_ID] ?? ($ligne['mnk__key__id'] ?? null));
            if ($ligneId === null) {
                $anomalies[] = new Anomalie(
                    Anomalie::LIGNE_SANS_IDENTIFIANT,
                    null,
                    'Ligne sans identifiant exploitable, ignoree.'
                );
                $lignesRejetees++;
                continue;
            }
            if (isset($lignesVues[$ligneId])) {
                $anomalies[] = new Anomalie(
                    Anomalie::DOUBLON_LIGNE_SOURCE,
                    $ligneId,
                    "L'identifiant $ligneId apparait plusieurs fois."
                );
                $lignesRejetees++;
                continue;
            }
            $lignesVues[$ligneId] = true;

            // Le "|| null" du TypeScript ramene 0 a null : un identifiant nul
            // n'est pas une reference.
            $produitId = self::entier($ligne[self::CHAMP_PRODUIT_ID] ?? null) ?: null;
            $tiersId = self::entier($ligne[self::CHAMP_TIERS_ID] ?? null) ?: null;

            $nomProduitBrut = Texte::nettoyerLibelle($ligne[self::CHAMP_PRODUIT_NOM] ?? null);
            $designationBrute = Texte::nettoyerLibelle($ligne[self::CHAMP_DESIGNATION_LIBRE] ?? null);
            $codeChezTiers = self::texte($ligne, self::CHAMP_CODE_CHEZ_TIERS) ?: null;

            foreach ([['designation', $designationBrute], ['nom produit', $nomProduitBrut]] as $paire) {
                [$champ, $resultat] = $paire;
                if ($resultat->mojibakeRepare()) {
                    $anomalies[] = new Anomalie(
                        Anomalie::LIBELLE_MOJIBAKE_REPARE,
                        $ligneId,
                        $champ . ' restaure : "' . $resultat->valeur() . '"'
                    );
                }
                if ($resultat->perteEncodage()) {
                    $anomalies[] = new Anomalie(
                        Anomalie::LIBELLE_PERTE_ENCODAGE,
                        $ligneId,
                        $champ . ' contient des caracteres perdus, non restaurables : "'
                            . $resultat->valeur() . '"'
                    );
                }
            }

            $brutPrix = $ligne[self::CHAMP_PRIX_FINAL] ?? null;
            $analysePrix = Monnaie::parseMontant($brutPrix);
            $brutPrixTexte = $brutPrix === null ? '' : (string) $brutPrix;

            // Une ligne sans produit, sans libelle et sans reference fournisseur
            // ne designe rien d'identifiable : elle ne peut pas devenir un
            // tarif. Le prix eventuellement present est mentionne explicitement,
            // parce qu'un montant qui disparait de l'import doit se voir dans
            // le rapport.
            if (!$produitId && $designationBrute->valeur() === '' && $codeChezTiers === null) {
                $prixPerdu = ($analysePrix->estValide() && $analysePrix->centimes() > 0)
                    ? ' Prix perdu : "' . $brutPrixTexte . '".'
                    : '';
                $anomalies[] = new Anomalie(
                    Anomalie::LIGNE_TOTALEMENT_VIDE,
                    $ligneId,
                    'Ni produit lie, ni designation, ni reference tiers.' . $prixPerdu
                );
                $lignesRejetees++;
                continue;
            }

            // --- Prix -----------------------------------------------------
            $prixLuCentimes = null;
            $prixCentimes = null;
            $echelle = Monnaie::ECHELLE_ARIARY_CERTAIN;
            $echelleCorrigee = false;
            $echelleIncertaine = false;

            if ($analysePrix->estValide() && $analysePrix->centimes() > 0) {
                $prixLuCentimes = $analysePrix->centimes();
                $echelle = Monnaie::classerEchelle($prixLuCentimes);

                if ($analysePrix->decimalesTronquees()) {
                    $anomalies[] = new Anomalie(
                        Anomalie::PRIX_DECIMALES_TRONQUEES,
                        $ligneId,
                        'Prix "' . $brutPrixTexte . '" tronque a deux decimales.'
                    );
                }

                if ($echelle === Monnaie::ECHELLE_MILLIERS_CERTAIN) {
                    $prixCentimes = Monnaie::corrigerMilliers($prixLuCentimes);
                    $echelleCorrigee = true;
                    $anomalies[] = new Anomalie(
                        Anomalie::ECHELLE_CORRIGEE_AUTOMATIQUEMENT,
                        $ligneId,
                        'Prix "' . $brutPrixTexte . '" interprete comme des milliers d\'ariary.'
                    );
                } else {
                    $prixCentimes = $prixLuCentimes;
                    if ($echelle === Monnaie::ECHELLE_A_ARBITRER) {
                        $echelleIncertaine = true;
                        $anomalies[] = new Anomalie(
                            Anomalie::ECHELLE_A_ARBITRER,
                            $ligneId,
                            'Prix "' . $brutPrixTexte . '" : ariary ou milliers d\'ariary, a trancher.'
                        );
                    }
                }
            } elseif (!$analysePrix->estValide() && $analysePrix->raison() === ResultatMontant::NON_NUMERIQUE) {
                $anomalies[] = new Anomalie(
                    Anomalie::PRIX_NON_NUMERIQUE,
                    $ligneId,
                    'Prix illisible : "' . $analysePrix->brut() . '"'
                );
            } elseif (!$analysePrix->estValide() && $analysePrix->raison() === ResultatMontant::HORS_LIMITES) {
                $anomalies[] = new Anomalie(
                    Anomalie::PRIX_HORS_LIMITES,
                    $ligneId,
                    'Prix aberrant : "' . $analysePrix->brut() . '"'
                );
            }

            if ($prixCentimes === null) {
                $anomalies[] = new Anomalie(
                    Anomalie::TARIF_SANS_PRIX,
                    $ligneId,
                    'Aucun prix exploitable sur cette ligne.'
                );
            }
            if (!$produitId) {
                $anomalies[] = new Anomalie(
                    Anomalie::TARIF_SANS_PRODUIT_LIE,
                    $ligneId,
                    'Aucun produit rattache. Designation libre : "'
                        . ($designationBrute->valeur() !== '' ? $designationBrute->valeur() : '(vide)') . '"'
                );
            }

            // --- Date -----------------------------------------------------
            $analyseDate = Dates::parseDateAAMMJJ($ligne[self::CHAMP_DATE] ?? null, $aujourdhui);
            if (!$analyseDate->estValide() && $analyseDate->raison() !== ResultatDate::VIDE) {
                $anomalies[] = new Anomalie(
                    Anomalie::DATE_ILLISIBLE,
                    $ligneId,
                    'Date "' . $analyseDate->brut() . '" (' . $analyseDate->raison() . ').'
                );
            }

            $etatBrut = self::texte($ligne, self::CHAMP_ETAT) ?: null;

            $tarifs[] = new Tarif(
                $ligneId,
                $produitId,
                $tiersId,
                $designationBrute->valeur() !== '' ? $designationBrute->valeur() : null,
                $designationBrute->valeur() !== ''
                    ? Texte::normaliserPourRecherche($designationBrute->valeur())
                    : null,
                $codeChezTiers,
                $prixCentimes,
                $prixLuCentimes,
                $echelle,
                $echelleCorrigee,
                $echelleIncertaine,
                $analyseDate->isoOuNull(),
                $etatBrut,
                self::interpreterEtat($etatBrut ?? ''),
                self::texte($ligne, self::CHAMP_SOCIETE) ?: null
            );

            // --- Produit --------------------------------------------------
            if ($produitId) {
                $nom = $nomProduitBrut->valeur();
                if (!isset($nomsParProduit[$produitId])) {
                    $nomsParProduit[$produitId] = [];
                }
                if ($nom !== '') {
                    // Cle = valeur : dedoublonne en preservant l'ordre
                    // d'insertion, comme le Set du TypeScript.
                    $nomsParProduit[$produitId][$nom] = true;
                }

                $image = $ligne[self::CHAMP_IMAGE] ?? null;
                $aPhoto = is_array($image)
                    && isset($image['total'])
                    && is_numeric($image['total'])
                    && (float) $image['total'] > 0;

                if (isset($produitsParId[$produitId])) {
                    $existant = $produitsParId[$produitId];
                    $existant->nombreTarifs++;
                    $existant->codeProduitA = $existant->codeProduitA
                        ?? (self::texte($ligne, self::CHAMP_PRODUIT_CODE_A) ?: null);
                    $existant->codeProduitN = $existant->codeProduitN
                        ?? (self::texte($ligne, self::CHAMP_PRODUIT_CODE_N) ?: null);
                    $existant->famille = $existant->famille
                        ?? (self::texte($ligne, self::CHAMP_FAMILLE) ?: null);
                    $existant->aPhoto = $existant->aPhoto || $aPhoto;
                    if ($existant->nom === '' && $nom !== '') {
                        $existant->nom = $nom;
                        $existant->nomNormalise = Texte::normaliserPourRecherche($nom);
                    }
                } else {
                    $produitsParId[$produitId] = new Produit(
                        $produitId,
                        $nom,
                        Texte::normaliserPourRecherche($nom),
                        self::texte($ligne, self::CHAMP_PRODUIT_CODE_A) ?: null,
                        self::texte($ligne, self::CHAMP_PRODUIT_CODE_N) ?: null,
                        self::texte($ligne, self::CHAMP_FAMILLE) ?: null,
                        $aPhoto,
                        1
                    );
                }
            }

            // --- Tiers ----------------------------------------------------
            if ($tiersId) {
                $qualiteBrute = self::texte($ligne, self::CHAMP_TIERS_QUALITE) ?: null;
                if (isset($tiersParId[$tiersId])) {
                    $existant = $tiersParId[$tiersId];
                    $existant->nombreTarifs++;
                    $existant->code = $existant->code
                        ?? (self::texte($ligne, self::CHAMP_TIERS_CODE) ?: null);
                    if ($existant->qualite === Tiers::INCONNUE && $qualiteBrute !== null) {
                        $existant->qualite = self::interpreterQualite($qualiteBrute);
                        $existant->qualiteBrute = $qualiteBrute;
                    }
                } else {
                    $tiersParId[$tiersId] = new Tiers(
                        $tiersId,
                        self::texte($ligne, self::CHAMP_TIERS_CODE) ?: null,
                        self::interpreterQualite($qualiteBrute ?? ''),
                        $qualiteBrute,
                        1
                    );
                }
            }
        }

        $produits = array_values($produitsParId);
        foreach (self::controlerCoherence($produits, $nomsParProduit, $tarifs) as $anomalie) {
            $anomalies[] = $anomalie;
        }

        return new ResultatExtraction(
            $produits,
            array_values($tiersParId),
            $tarifs,
            $anomalies,
            $lignesRejetees
        );
    }

    public static function interpreterQualite(string $brute): string
    {
        switch ($brute) {
            case 'F':
            case 'f':
                return Tiers::FOURNISSEUR;
            case 'c':
                return Tiers::CLIENT;
            case 'p':
            case 'P':
                return Tiers::PROSPECT;
            default:
                return Tiers::INCONNUE;
        }
    }

    /** "a"/"A" = actif, "NA" = non actif, vide = non renseigne (traite comme actif). */
    public static function interpreterEtat(string $brut): bool
    {
        return mb_strtoupper(trim($brut), 'UTF-8') !== 'NA';
    }

    /**
     * Controles qui ne peuvent se faire qu'une fois toutes les lignes lues :
     * ils portent sur des collisions entre enregistrements, pas sur une ligne.
     *
     * @param Produit[]                          $produits
     * @param array<int, array<string, true>>    $nomsParProduit
     * @param Tarif[]                            $tarifs
     * @return Anomalie[]
     */
    private static function controlerCoherence(array $produits, array $nomsParProduit, array $tarifs): array
    {
        $anomalies = [];

        foreach ($nomsParProduit as $produitId => $noms) {
            if (count($noms) > 1) {
                $anomalies[] = new Anomalie(
                    Anomalie::PRODUIT_NOMS_DIVERGENTS,
                    null,
                    "Produit $produitId porte plusieurs noms : " . implode(' | ', array_keys($noms))
                );
            }
        }

        $produitsParCode = [];
        $produitsParNom = [];
        foreach ($produits as $produit) {
            if ($produit->codeProduitA !== null && $produit->codeProduitA !== '') {
                $produitsParCode[$produit->codeProduitA][$produit->sourceProduitId] = true;
            }
            if ($produit->nomNormalise !== '') {
                $produitsParNom[$produit->nomNormalise][$produit->sourceProduitId] = true;
            }
        }

        foreach ($produitsParCode as $code => $ids) {
            if (count($ids) > 1) {
                $anomalies[] = new Anomalie(
                    Anomalie::CODE_PRODUIT_PARTAGE,
                    null,
                    'Code produit "' . $code . '" porte par ' . count($ids) . ' produits ('
                        . implode(', ', array_keys($ids)) . '). Inutilisable comme cle.'
                );
            }
        }

        foreach ($produitsParNom as $nom => $ids) {
            if (count($ids) > 1) {
                $anomalies[] = new Anomalie(
                    Anomalie::NOM_PARTAGE_PAR_PLUSIEURS_PRODUITS,
                    null,
                    'Nom "' . $nom . '" partage par les produits ' . implode(', ', array_keys($ids)) . '.'
                );
            }
        }

        $paires = [];
        foreach ($tarifs as $tarif) {
            if (!$tarif->sourceProduitId || !$tarif->sourceTiersId) {
                continue;
            }
            $paires[$tarif->sourceTiersId . '|' . $tarif->sourceProduitId][] = $tarif;
        }
        foreach ($paires as $cle => $lot) {
            if (count($lot) > 1) {
                $prix = [];
                foreach ($lot as $tarif) {
                    $prix[] = self::commeNombreJs(($tarif->prixCentimes ?? 0) / 100);
                }
                $anomalies[] = new Anomalie(
                    Anomalie::DOUBLON_TIERS_PRODUIT,
                    $lot[0]->sourceLigneId,
                    count($lot) . " tarifs pour le couple (tiers|produit) $cle : " . implode(' / ', $prix)
                );
            }
        }

        return $anomalies;
    }

    /**
     * Rend un nombre comme le ferait String() en JavaScript : "34400" et non
     * "34400.00", "8.5" et non "8.50". Le detail n'a d'importance que pour
     * garder les messages d'anomalie identiques entre les deux
     * implementations, ce que le test differentiel verifie.
     */
    private static function commeNombreJs(float $valeur): string
    {
        if ($valeur === floor($valeur) && abs($valeur) < 1.0e15) {
            return (string) (int) $valeur;
        }

        return rtrim(rtrim(sprintf('%.10F', $valeur), '0'), '.');
    }

    /** @param array<string, mixed> $ligne */
    private static function texte(array $ligne, string $champ): string
    {
        return Texte::nettoyerLibelle($ligne[$champ] ?? null)->valeur();
    }

    /**
     * Equivalent du helper `entier` du TypeScript : null pour tout ce qui
     * n'est pas un entier fini. Number("12.5") vaut 12.5 et n'est pas un
     * entier : la valeur est donc rejetee, pas tronquee.
     *
     * @param mixed $valeur
     */
    private static function entier($valeur): ?int
    {
        if ($valeur === null || $valeur === '' || is_array($valeur) || is_bool($valeur)) {
            return null;
        }
        if (is_int($valeur)) {
            return $valeur;
        }
        if (!is_numeric($valeur)) {
            return null;
        }

        $nombre = (float) $valeur;
        if (!is_finite($nombre) || $nombre !== floor($nombre)) {
            return null;
        }

        return (int) $nombre;
    }
}
