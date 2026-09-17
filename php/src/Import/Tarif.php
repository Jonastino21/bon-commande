<?php

declare(strict_types=1);

namespace App\Import;

/**
 * Un tarif : un prix negocie entre un tiers et un produit.
 * C'est l'unite que l'utilisateur ajoute a un document — on n'achete pas
 * "du ciment", on achete "du ciment chez tel fournisseur a tel prix".
 */
final class Tarif
{
    public int $sourceLigneId;
    public ?int $sourceProduitId;
    public ?int $sourceTiersId;

    /** Libelle saisi par le tiers, seul identifiant des lignes non rattachees. */
    public ?string $designationLibre;
    public ?string $designationNormalisee;

    /** Reference du produit chez ce tiers (colonne "F code"). */
    public ?string $codeChezTiers;

    /** Centimes d'ariary, apres correction d'echelle eventuelle. */
    public ?int $prixCentimes;

    /** Valeur telle que lue, avant toute correction d'echelle. */
    public ?int $prixLuCentimes;

    public string $echelle;
    public bool $echelleCorrigee;

    /** Vrai tant qu'un humain n'a pas tranche l'echelle de cette ligne. */
    public bool $echelleIncertaine;

    public ?string $dateTarif;
    public ?string $etatBrut;
    public bool $actif;
    public ?string $societe;

    public function __construct(
        int $sourceLigneId,
        ?int $sourceProduitId,
        ?int $sourceTiersId,
        ?string $designationLibre,
        ?string $designationNormalisee,
        ?string $codeChezTiers,
        ?int $prixCentimes,
        ?int $prixLuCentimes,
        string $echelle,
        bool $echelleCorrigee,
        bool $echelleIncertaine,
        ?string $dateTarif,
        ?string $etatBrut,
        bool $actif,
        ?string $societe
    ) {
        $this->sourceLigneId = $sourceLigneId;
        $this->sourceProduitId = $sourceProduitId;
        $this->sourceTiersId = $sourceTiersId;
        $this->designationLibre = $designationLibre;
        $this->designationNormalisee = $designationNormalisee;
        $this->codeChezTiers = $codeChezTiers;
        $this->prixCentimes = $prixCentimes;
        $this->prixLuCentimes = $prixLuCentimes;
        $this->echelle = $echelle;
        $this->echelleCorrigee = $echelleCorrigee;
        $this->echelleIncertaine = $echelleIncertaine;
        $this->dateTarif = $dateTarif;
        $this->etatBrut = $etatBrut;
        $this->actif = $actif;
        $this->societe = $societe;
    }
}
