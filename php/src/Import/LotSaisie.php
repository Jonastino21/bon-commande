<?php

declare(strict_types=1);

namespace App\Import;

/** Un bloc de tarifs vraisemblablement saisis dans la meme session. */
final class LotSaisie
{
    public string $id;
    public ?int $sourceTiersId;
    public int $premierLigneId;
    public int $dernierLigneId;

    /** @var Tarif[] */
    public array $tarifs = [];

    /** Mediane en ariary, indice le plus robuste de l'echelle du lot. */
    public float $medianeAriary = 0.0;
    public float $minAriary = 0.0;
    public float $maxAriary = 0.0;

    public int $nombreIncertains = 0;
    public int $nombreCorriges = 0;

    /** Vrai si le lot contient au moins une ligne que l'automatisme n'a pas su trancher. */
    public bool $demandeArbitrage = false;

    /** Vrai si le lot melange visiblement les deux echelles : a regarder de pres. */
    public bool $echellesMelangees = false;

    public function __construct(string $id, ?int $sourceTiersId, int $premierLigneId, int $dernierLigneId)
    {
        $this->id = $id;
        $this->sourceTiersId = $sourceTiersId;
        $this->premierLigneId = $premierLigneId;
        $this->dernierLigneId = $dernierLigneId;
    }
}
