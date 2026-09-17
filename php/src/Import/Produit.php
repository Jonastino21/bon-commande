<?php

declare(strict_types=1);

namespace App\Import;

/**
 * Produit reconstitue par agregation des lignes de tarif.
 *
 * Porteur de donnees, pas objet a invariants : les proprietes sont publiques
 * et mutables parce que l'extraction les complete ligne apres ligne, comme le
 * fait le TypeScript. `readonly` n'existe pas en PHP 8.0.
 */
final class Produit
{
    public int $sourceProduitId;
    public string $nom;
    public string $nomNormalise;
    public ?string $codeProduitA;
    public ?string $codeProduitN;
    public ?string $famille;
    public bool $aPhoto;
    public int $nombreTarifs;

    public function __construct(
        int $sourceProduitId,
        string $nom,
        string $nomNormalise,
        ?string $codeProduitA,
        ?string $codeProduitN,
        ?string $famille,
        bool $aPhoto,
        int $nombreTarifs
    ) {
        $this->sourceProduitId = $sourceProduitId;
        $this->nom = $nom;
        $this->nomNormalise = $nomNormalise;
        $this->codeProduitA = $codeProduitA;
        $this->codeProduitN = $codeProduitN;
        $this->famille = $famille;
        $this->aPhoto = $aPhoto;
        $this->nombreTarifs = $nombreTarifs;
    }
}
