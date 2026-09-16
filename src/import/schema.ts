import { z } from 'zod';

/**
 * Validation du fichier produit par l'extension d'export Verif K7.
 *
 * Principe : STRICT sur l'enveloppe, TOLERANT sur les colonnes.
 * L'enveloppe (source, moduleId, rows...) est le contrat de l'extension, on
 * peut s'y fier. Les colonnes, elles, appartiennent au portail : une colonne
 * ajoutee dans Verif K7 ne doit jamais faire echouer un import. Les lignes
 * sont donc des enregistrements ouverts, et c'est l'extraction qui decide
 * champ par champ de ce qu'elle sait lire.
 */

/** Taille maximale acceptee, garde-fou contre un fichier aberrant. */
export const TAILLE_MAX_OCTETS = 100 * 1024 * 1024;

const valeurCellule = z.unknown();

export const ligneBruteSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    mnk__key__id: z.union([z.number(), z.string()]).optional(),
  })
  .catchall(valeurCellule);

export const enregistrementIgnoreSchema = z.object({
  page: z.number(),
  size: z.number(),
});

export const fichierExportSchema = z.object({
  source: z.string().optional(),
  moduleId: z.union([z.number(), z.string()]),
  viewId: z.union([z.number(), z.string()]).optional(),
  societeFilter: z.string().optional(),
  expectedTotal: z.number().optional(),
  totalRecords: z.number().optional(),
  extractedAt: z.string().optional(),
  skippedRecords: z.array(enregistrementIgnoreSchema).default([]),
  fields: z.record(z.string()).default({}),
  rows: z.array(ligneBruteSchema),
});

export type FichierExport = z.infer<typeof fichierExportSchema>;
export type LigneBrute = z.infer<typeof ligneBruteSchema>;

export type ProblemeFichier = {
  chemin: string;
  message: string;
};

export type ResultatValidation =
  | { ok: true; fichier: FichierExport; avertissements: string[] }
  | { ok: false; problemes: ProblemeFichier[] };

/**
 * Colonnes attendues du module 21 (tarifs tiers). Leur absence n'est pas une
 * erreur bloquante : elle est remontee en avertissement, pour qu'un export
 * fait sur le mauvais module se voie immediatement au lieu de produire un
 * catalogue vide sans explication.
 */
const COLONNES_ATTENDUES_MODULE_21 = [
  'assoc__produit__id',
  'assoc__produit__327',
  'assoc__client__id',
  'assoc__client__326',
  'tarifFinale',
  'designActeur',
] as const;

export function validerFichier(contenu: unknown): ResultatValidation {
  const analyse = fichierExportSchema.safeParse(contenu);
  if (!analyse.success) {
    return {
      ok: false,
      problemes: analyse.error.issues.map((probleme) => ({
        chemin: probleme.path.join('.') || '(racine)',
        message: probleme.message,
      })),
    };
  }

  const fichier = analyse.data;
  const avertissements: string[] = [];

  if (fichier.rows.length === 0) {
    avertissements.push("Le fichier ne contient aucune ligne.");
  }

  if (
    fichier.expectedTotal !== undefined &&
    fichier.totalRecords !== undefined &&
    fichier.expectedTotal !== fichier.totalRecords
  ) {
    const manquants = fichier.expectedTotal - fichier.totalRecords;
    avertissements.push(
      `${manquants} enregistrement(s) n'ont pas pu etre recuperes par l'extension ` +
        `(le portail a renvoye une erreur serveur). Attendu ${fichier.expectedTotal}, ` +
        `recu ${fichier.totalRecords}.`,
    );
  }

  const premiere = fichier.rows[0];
  if (premiere) {
    const absentes = COLONNES_ATTENDUES_MODULE_21.filter((colonne) => !(colonne in premiere));
    if (absentes.length > 0) {
      avertissements.push(
        `Colonnes attendues absentes : ${absentes.join(', ')}. ` +
          `Verifiez que l'export provient bien du module "tarifs tiers".`,
      );
    }
  }

  return { ok: true, fichier, avertissements };
}
