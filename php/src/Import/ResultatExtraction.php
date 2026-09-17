<?php

declare(strict_types=1);

namespace App\Import;

final class ResultatExtraction
{
    /** @var Produit[] */
    public array $produits;

    /** @var Tiers[] */
    public array $tiers;

    /** @var Tarif[] */
    public array $tarifs;

    /** @var Anomalie[] */
    public array $anomalies;

    /** Lignes ecartees, qui ne produiront aucune entite. */
    public int $lignesRejetees;

    /**
     * @param Produit[]  $produits
     * @param Tiers[]    $tiers
     * @param Tarif[]    $tarifs
     * @param Anomalie[] $anomalies
     */
    public function __construct(
        array $produits,
        array $tiers,
        array $tarifs,
        array $anomalies,
        int $lignesRejetees
    ) {
        $this->produits = $produits;
        $this->tiers = $tiers;
        $this->tarifs = $tarifs;
        $this->anomalies = $anomalies;
        $this->lignesRejetees = $lignesRejetees;
    }
}
