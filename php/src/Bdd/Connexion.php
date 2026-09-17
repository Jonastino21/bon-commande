<?php

declare(strict_types=1);

namespace App\Bdd;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use PDOException;
use RuntimeException;
use Throwable;

/**
 * Ouverture de la base MySQL. Portage de src/bdd/connexion.ts.
 *
 * PDO pur, sans framework : ce fichier fonctionne tel quel une fois depose
 * dans app/ d'une application Laravel, ou en dehors.
 */
final class Connexion
{
    /**
     * Reglages non negociables :
     *
     * - ERRMODE_EXCEPTION : une erreur SQL silencieuse pendant un import
     *   produirait un catalogue a moitie ecrit.
     * - EMULATE_PREPARES a false : sans cela, PDO renvoie TOUS les entiers en
     *   chaines. Un montant relu en "850000" au lieu de 850000 finirait par
     *   etre concatene quelque part au lieu d'etre additionne.
     * - STRINGIFY_FETCHES a false : meme raison, cote lecture.
     */
    public static function ouvrir(
        string $hote,
        string $base,
        string $utilisateur,
        string $motDePasse,
        int $port = 3306
    ): PDO {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $hote, $port, $base);

        try {
            $pdo = new PDO($dsn, $utilisateur, $motDePasse, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]);
        } catch (PDOException $erreur) {
            throw new RuntimeException(
                "Connexion a la base « $base » impossible : " . $erreur->getMessage(),
                0,
                $erreur
            );
        }

        return $pdo;
    }

    /**
     * Applique le schema.
     *
     * Le fichier est decoupe sur les points-virgules en fin de ligne : les
     * instructions du schema sont simples, aucune ne contient de
     * point-virgule dans une chaine. Un decoupage plus savant serait du
     * travail perdu tant que ce n'est pas le cas.
     */
    public static function appliquerSchema(PDO $pdo, ?string $chemin = null): void
    {
        $chemin = $chemin ?? __DIR__ . '/schema.sql';
        $sql = file_get_contents($chemin);
        if ($sql === false) {
            throw new RuntimeException("Schema introuvable : $chemin");
        }

        foreach (self::decouperInstructions($sql) as $instruction) {
            $pdo->exec($instruction);
        }
    }

    /** @return string[] */
    public static function decouperInstructions(string $sql): array
    {
        $instructions = [];
        $courante = '';

        foreach (preg_split('/\R/', $sql) ?: [] as $ligne) {
            $nue = trim($ligne);
            if ($nue === '' || strpos($nue, '--') === 0) {
                continue;
            }

            $courante .= $ligne . "\n";

            if (substr($nue, -1) === ';') {
                $instructions[] = trim(rtrim(trim($courante), ';'));
                $courante = '';
            }
        }

        $reste = trim($courante);
        if ($reste !== '') {
            $instructions[] = rtrim($reste, ';');
        }

        return array_values(array_filter($instructions, static function (string $i): bool {
            return $i !== '';
        }));
    }

    /**
     * Execute une action dans une transaction.
     *
     * Indispensable pour l'import : un catalogue a moitie mis a jour serait
     * pire que pas de mise a jour du tout. Soit tout passe, soit rien.
     *
     * @template T
     * @param callable():T $action
     * @return T
     */
    public static function enTransaction(PDO $pdo, callable $action)
    {
        $pdo->beginTransaction();
        try {
            $resultat = $action();
            $pdo->commit();
            return $resultat;
        } catch (Throwable $erreur) {
            // Une instruction DDL valide un commit implicite en MySQL :
            // la transaction peut deja etre close quand on arrive ici.
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $erreur;
        }
    }

    /** MySQL ne connait pas les booleens : on stocke 0 ou 1. */
    public static function versEntier(bool $valeur): int
    {
        return $valeur ? 1 : 0;
    }

    /** @param mixed $valeur */
    public static function versBooleen($valeur): bool
    {
        return (int) $valeur === 1;
    }

    /** Horodatage ISO 8601 en UTC, meme format que Date#toISOString(). */
    public static function maintenant(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    }
}
