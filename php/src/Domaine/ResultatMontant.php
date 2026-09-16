<?php

declare(strict_types=1);

namespace App\Domaine;

use LogicException;

/**
 * Resultat d'une conversion de montant.
 *
 * En TypeScript, `ResultatMontant` est une union discriminee : le
 * compilateur refuse de lire `.centimes` tant que `ok` n'a pas ete teste.
 * PHP n'a pas cet appui du typage, donc on le remplace par une garde a
 * l'execution : `centimes()` leve une exception sur un resultat invalide.
 *
 * Ce n'est pas un detail de style. Sans cette garde, un `?->centimes ?? 0`
 * distrait transformerait un prix illisible en un montant de zero ariary,
 * silencieusement, dans un bon de commande.
 */
final class ResultatMontant
{
    public const VIDE = 'vide';
    public const NON_NUMERIQUE = 'non_numerique';
    public const NEGATIF = 'negatif';
    public const HORS_LIMITES = 'hors_limites';

    private bool $ok;
    private int $centimes;
    private bool $decimalesTronquees;
    private ?string $raison;
    private string $brut;

    private function __construct(
        bool $ok,
        int $centimes,
        bool $decimalesTronquees,
        ?string $raison,
        string $brut
    ) {
        $this->ok = $ok;
        $this->centimes = $centimes;
        $this->decimalesTronquees = $decimalesTronquees;
        $this->raison = $raison;
        $this->brut = $brut;
    }

    public static function succes(int $centimes, bool $decimalesTronquees): self
    {
        return new self(true, $centimes, $decimalesTronquees, null, '');
    }

    public static function echec(string $raison, string $brut): self
    {
        return new self(false, 0, false, $raison, $brut);
    }

    public function estValide(): bool
    {
        return $this->ok;
    }

    /** @throws LogicException si le montant n'a pas pu etre converti. */
    public function centimes(): int
    {
        if (!$this->ok) {
            throw new LogicException(
                "Lecture d'un montant invalide (" . $this->raison . ") : " . $this->brut
            );
        }

        return $this->centimes;
    }

    /**
     * Vrai quand l'export portait plus de deux decimales. On tronque, mais on
     * le signale : arrondir en silence un prix fournisseur serait une
     * alteration invisible.
     */
    public function decimalesTronquees(): bool
    {
        return $this->decimalesTronquees;
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
