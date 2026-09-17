<?php

declare(strict_types=1);

namespace App\Import;

/** Tiers (fournisseur, client, prospect) reconstitue par agregation. */
final class Tiers
{
    public const FOURNISSEUR = 'fournisseur';
    public const CLIENT = 'client';
    public const PROSPECT = 'prospect';
    public const INCONNUE = 'inconnue';

    public int $sourceTiersId;
    public ?string $code;
    public string $qualite;
    public ?string $qualiteBrute;
    public int $nombreTarifs;

    public function __construct(
        int $sourceTiersId,
        ?string $code,
        string $qualite,
        ?string $qualiteBrute,
        int $nombreTarifs
    ) {
        $this->sourceTiersId = $sourceTiersId;
        $this->code = $code;
        $this->qualite = $qualite;
        $this->qualiteBrute = $qualiteBrute;
        $this->nombreTarifs = $nombreTarifs;
    }
}
