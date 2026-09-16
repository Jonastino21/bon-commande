<?php

declare(strict_types=1);

namespace App\Domaine;

/** Resultat du nettoyage d'un libelle importe. */
final class ResultatTexte
{
    private string $valeur;
    private bool $mojibakeRepare;
    private bool $perteEncodage;
    private bool $espacesNormalises;

    public function __construct(
        string $valeur,
        bool $mojibakeRepare,
        bool $perteEncodage,
        bool $espacesNormalises
    ) {
        $this->valeur = $valeur;
        $this->mojibakeRepare = $mojibakeRepare;
        $this->perteEncodage = $perteEncodage;
        $this->espacesNormalises = $espacesNormalises;
    }

    public function valeur(): string
    {
        return $this->valeur;
    }

    public function mojibakeRepare(): bool
    {
        return $this->mojibakeRepare;
    }

    /** Vrai quand l'information est perdue et qu'aucun code ne la restaurera. */
    public function perteEncodage(): bool
    {
        return $this->perteEncodage;
    }

    public function espacesNormalises(): bool
    {
        return $this->espacesNormalises;
    }
}
