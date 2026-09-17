<?php

declare(strict_types=1);

namespace App\Domaine;

use LogicException;

/**
 * Resultat d'une lecture de date AAMMJJ.
 *
 * Meme garde que ResultatMontant : lire l'ISO d'une date invalide leve une
 * exception plutot que de rendre une chaine vide qu'un appelant distrait
 * ecrirait en base.
 */
final class ResultatDate
{
    public const VIDE = 'vide';
    public const FORMAT = 'format';
    public const INVALIDE = 'invalide';
    public const FUTURE = 'future';

    private bool $ok;
    private string $iso;
    private ?string $raison;
    private string $brut;

    private function __construct(bool $ok, string $iso, ?string $raison, string $brut)
    {
        $this->ok = $ok;
        $this->iso = $iso;
        $this->raison = $raison;
        $this->brut = $brut;
    }

    public static function succes(string $iso): self
    {
        return new self(true, $iso, null, '');
    }

    public static function echec(string $raison, string $brut): self
    {
        return new self(false, '', $raison, $brut);
    }

    public function estValide(): bool
    {
        return $this->ok;
    }

    /** @throws LogicException si la date n'a pas pu etre lue. */
    public function iso(): string
    {
        if (!$this->ok) {
            throw new LogicException("Lecture d'une date invalide (" . $this->raison . ') : ' . $this->brut);
        }

        return $this->iso;
    }

    /** L'ISO, ou null quand la date est illisible. Pour les colonnes nullables. */
    public function isoOuNull(): ?string
    {
        return $this->ok ? $this->iso : null;
    }

    public function raison(): ?string
    {
        return $this->raison;
    }

    public function brut(): string
    {
        return $this->brut;
    }
}
