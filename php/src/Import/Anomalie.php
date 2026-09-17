<?php

declare(strict_types=1);

namespace App\Import;

/**
 * Anomalie relevee pendant l'extraction.
 *
 * Aucune donnee n'est jetee en silence : tout ce qui est corrige, ignore ou
 * douteux ressort ici, avec de quoi retrouver la ligne d'origine.
 */
final class Anomalie
{
    public const LIGNE_SANS_IDENTIFIANT = 'ligne_sans_identifiant';
    public const LIGNE_TOTALEMENT_VIDE = 'ligne_totalement_vide';
    public const TARIF_SANS_PRIX = 'tarif_sans_prix';
    public const TARIF_SANS_PRODUIT_LIE = 'tarif_sans_produit_lie';
    public const PRIX_NON_NUMERIQUE = 'prix_non_numerique';
    public const PRIX_HORS_LIMITES = 'prix_hors_limites';
    public const PRIX_DECIMALES_TRONQUEES = 'prix_decimales_tronquees';
    public const ECHELLE_CORRIGEE_AUTOMATIQUEMENT = 'echelle_corrigee_automatiquement';
    public const ECHELLE_A_ARBITRER = 'echelle_a_arbitrer';
    public const LIBELLE_MOJIBAKE_REPARE = 'libelle_mojibake_repare';
    public const LIBELLE_PERTE_ENCODAGE = 'libelle_perte_encodage';
    public const DATE_ILLISIBLE = 'date_illisible';
    public const DOUBLON_LIGNE_SOURCE = 'doublon_ligne_source';
    public const DOUBLON_TIERS_PRODUIT = 'doublon_tiers_produit';
    public const PRODUIT_NOMS_DIVERGENTS = 'produit_noms_divergents';
    public const CODE_PRODUIT_PARTAGE = 'code_produit_partage';
    public const NOM_PARTAGE_PAR_PLUSIEURS_PRODUITS = 'nom_partage_par_plusieurs_produits';

    public string $type;
    public ?int $ligneId;
    public string $detail;

    public function __construct(string $type, ?int $ligneId, string $detail)
    {
        $this->type = $type;
        $this->ligneId = $ligneId;
        $this->detail = $detail;
    }
}
