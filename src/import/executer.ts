import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { TAILLE_MAX_OCTETS, validerFichier } from './schema.js';
import { extraire, type ResultatExtraction } from './extraction.js';
import { construireLots, type LotSaisie } from './lots.js';
import { construireRapport, type RapportImport } from './rapport.js';

/**
 * Orchestration d'un import : lecture, validation, extraction, regroupement
 * en lots, rapport. Aucune ecriture en base a ce stade : la phase 1 doit
 * pouvoir etre relancee autant de fois que necessaire sans effet de bord.
 */

export type EchecImport = {
  ok: false;
  etape: 'lecture' | 'taille' | 'json' | 'validation';
  messages: string[];
};

export type SuccesImport = {
  ok: true;
  rapport: RapportImport;
  extraction: ResultatExtraction;
  lots: LotSaisie[];
};

export type ResultatImport = SuccesImport | EchecImport;

export async function executerImport(
  chemin: string,
  aujourdhui = new Date(),
): Promise<ResultatImport> {
  let tailleOctets = 0;
  try {
    const infos = await stat(chemin);
    tailleOctets = infos.size;
  } catch {
    return { ok: false, etape: 'lecture', messages: [`Fichier introuvable : ${chemin}`] };
  }

  if (tailleOctets > TAILLE_MAX_OCTETS) {
    return {
      ok: false,
      etape: 'taille',
      messages: [
        `Fichier de ${(tailleOctets / 1024 / 1024).toFixed(1)} Mo, au-dela de la limite de ` +
          `${TAILLE_MAX_OCTETS / 1024 / 1024} Mo.`,
      ],
    };
  }

  let contenu: unknown;
  try {
    contenu = JSON.parse(await readFile(chemin, 'utf8'));
  } catch (erreur) {
    return {
      ok: false,
      etape: 'json',
      messages: [
        "Le fichier n'est pas un JSON valide. Il est probablement incomplet : " +
          "relancez l'export depuis le portail.",
        erreur instanceof Error ? erreur.message : String(erreur),
      ],
    };
  }

  const validation = validerFichier(contenu);
  if (!validation.ok) {
    return {
      ok: false,
      etape: 'validation',
      messages: validation.problemes.map((probleme) => `${probleme.chemin} : ${probleme.message}`),
    };
  }

  const extraction = extraire(validation.fichier.rows, aujourdhui);
  const lots = construireLots(extraction.tarifs);
  const rapport = construireRapport({
    nomFichier: basename(chemin),
    tailleOctets,
    fichier: validation.fichier,
    extraction,
    lots,
    avertissements: validation.avertissements,
  });

  return { ok: true, rapport, extraction, lots };
}
