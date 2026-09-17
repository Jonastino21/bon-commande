<?php

declare(strict_types=1);

namespace App\Import;

use LogicException;

/**
 * Resultat de la validation de l'enveloppe d'un export.
 *
 * `fichier()` leve sur un resultat invalide : meme garde que ResultatMontant.
 * Rien ne doit pouvoir extraire depuis un fichier qui n'a pas passe la
 * validation.
 */
final class ResultatValidation
{
    private bool $ok;

    /** @var array<string, mixed>|null */
    private ?array $fichier;

    /** @var string[] */
    private array $avertissements;

    /** @var array<int, array{chemin: string, message: string}> */
    private array $problemes;

    /**
     * @param array<string, mixed>|null                        $fichier
     * @param string[]                                         $avertissements
     * @param array<int, array{chemin: string, message: string}> $problemes
     */
    private function __construct(bool $ok, ?array $fichier, array $avertissements, array $problemes)
    {
        $this->ok = $ok;
        $this->fichier = $fichier;
        $this->avertissements = $avertissements;
        $this->problemes = $problemes;
    }

    /**
     * @param array<string, mixed> $fichier
     * @param string[]             $avertissements
     */
    public static function succes(array $fichier, array $avertissements): self
    {
        return new self(true, $fichier, $avertissements, []);
    }

    /** @param array<int, array{chemin: string, message: string}> $problemes */
    public static function echec(array $problemes): self
    {
        return new self(false, null, [], $problemes);
    }

    public function estValide(): bool
    {
        return $this->ok;
    }

    /**
     * @return array<string, mixed>
     * @throws LogicException si le fichier n'a pas passe la validation.
     */
    public function fichier(): array
    {
        if (!$this->ok || $this->fichier === null) {
            throw new LogicException("Lecture d'un fichier d'export invalide.");
        }

        return $this->fichier;
    }

    /** @return string[] */
    public function avertissements(): array
    {
        return $this->avertissements;
    }

    /** @return array<int, array{chemin: string, message: string}> */
    public function problemes(): array
    {
        return $this->problemes;
    }
}
