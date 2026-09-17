<?php

declare(strict_types=1);

namespace App\Import;

/**
 * Validation du fichier produit par l'extension d'export Verif K7.
 * Portage de src/import/schema.ts.
 *
 * Principe : STRICT sur l'enveloppe, TOLERANT sur les colonnes.
 * L'enveloppe (source, moduleId, rows...) est le contrat de l'extension, on
 * peut s'y fier. Les colonnes, elles, appartiennent au portail : une colonne
 * ajoutee dans Verif K7 ne doit jamais faire echouer un import. Les lignes
 * sont donc des enregistrements ouverts, et c'est l'extraction qui decide
 * champ par champ de ce qu'elle sait lire.
 *
 * Zod n'a pas d'equivalent ici : la validation est ecrite a la main, en
 * conservant le meme decoupage strict/tolerant et les memes messages.
 */
final class SchemaExport
{
    /** Taille maximale acceptee, garde-fou contre un fichier aberrant. */
    public const TAILLE_MAX_OCTETS = 104857600; // 100 Mo

    /**
     * Colonnes attendues du module 21 (tarifs tiers). Leur absence n'est pas
     * une erreur bloquante : elle est remontee en avertissement, pour qu'un
     * export fait sur le mauvais module se voie immediatement au lieu de
     * produire un catalogue vide sans explication.
     */
    private const COLONNES_ATTENDUES_MODULE_21 = [
        'assoc__produit__id',
        'assoc__produit__327',
        'assoc__client__id',
        'assoc__client__326',
        'tarifFinale',
        'designActeur',
    ];

    /** @param mixed $contenu */
    public static function validerFichier($contenu): ResultatValidation
    {
        $problemes = [];

        if (!is_array($contenu)) {
            return ResultatValidation::echec([
                ['chemin' => '(racine)', 'message' => 'Le contenu attendu est un objet.'],
            ]);
        }

        // --- Enveloppe : strict -------------------------------------------
        if (!array_key_exists('moduleId', $contenu)) {
            $problemes[] = ['chemin' => 'moduleId', 'message' => 'Champ obligatoire absent.'];
        } elseif (!is_int($contenu['moduleId']) && !is_float($contenu['moduleId']) && !is_string($contenu['moduleId'])) {
            $problemes[] = ['chemin' => 'moduleId', 'message' => 'Nombre ou chaine attendu.'];
        }

        if (!array_key_exists('rows', $contenu)) {
            $problemes[] = ['chemin' => 'rows', 'message' => 'Champ obligatoire absent.'];
        } elseif (!self::estListe($contenu['rows'])) {
            $problemes[] = ['chemin' => 'rows', 'message' => 'Tableau attendu.'];
        } else {
            foreach ($contenu['rows'] as $index => $ligne) {
                if (!is_array($ligne)) {
                    $problemes[] = ['chemin' => "rows.$index", 'message' => 'Objet attendu.'];
                }
            }
        }

        foreach (['source' => 'chaine', 'societeFilter' => 'chaine', 'extractedAt' => 'chaine'] as $champ => $_) {
            if (isset($contenu[$champ]) && !is_string($contenu[$champ])) {
                $problemes[] = ['chemin' => $champ, 'message' => 'Chaine attendue.'];
            }
        }

        foreach (['expectedTotal', 'totalRecords'] as $champ) {
            if (isset($contenu[$champ]) && !is_int($contenu[$champ]) && !is_float($contenu[$champ])) {
                $problemes[] = ['chemin' => $champ, 'message' => 'Nombre attendu.'];
            }
        }

        if (isset($contenu['skippedRecords']) && !self::estListe($contenu['skippedRecords'])) {
            $problemes[] = ['chemin' => 'skippedRecords', 'message' => 'Tableau attendu.'];
        }

        if (isset($contenu['fields']) && !is_array($contenu['fields'])) {
            $problemes[] = ['chemin' => 'fields', 'message' => 'Objet attendu.'];
        }

        if ($problemes !== []) {
            return ResultatValidation::echec($problemes);
        }

        // --- Valeurs par defaut -------------------------------------------
        $fichier = $contenu;
        $fichier['skippedRecords'] = $contenu['skippedRecords'] ?? [];
        $fichier['fields'] = $contenu['fields'] ?? [];

        // --- Avertissements -----------------------------------------------
        $avertissements = [];

        if (count($fichier['rows']) === 0) {
            $avertissements[] = 'Le fichier ne contient aucune ligne.';
        }

        $attendu = $contenu['expectedTotal'] ?? null;
        $recu = $contenu['totalRecords'] ?? null;
        if ($attendu !== null && $recu !== null && $attendu !== $recu) {
            $manquants = (int) $attendu - (int) $recu;
            $avertissements[] = "$manquants enregistrement(s) n'ont pas pu etre recuperes par l'extension "
                . "(le portail a renvoye une erreur serveur). Attendu " . (int) $attendu
                . ', recu ' . (int) $recu . '.';
        }

        $premiere = $fichier['rows'][0] ?? null;
        if (is_array($premiere)) {
            $absentes = [];
            foreach (self::COLONNES_ATTENDUES_MODULE_21 as $colonne) {
                if (!array_key_exists($colonne, $premiere)) {
                    $absentes[] = $colonne;
                }
            }
            if ($absentes !== []) {
                $avertissements[] = 'Colonnes attendues absentes : ' . implode(', ', $absentes)
                    . '. Verifiez que l\'export provient bien du module "tarifs tiers".';
            }
        }

        return ResultatValidation::succes($fichier, $avertissements);
    }

    /** @param mixed $valeur */
    private static function estListe($valeur): bool
    {
        if (!is_array($valeur)) {
            return false;
        }

        // array_is_list() n'existe qu'a partir de PHP 8.1.
        return $valeur === [] || array_keys($valeur) === range(0, count($valeur) - 1);
    }
}
