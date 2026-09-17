import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { ouvrirBdd, appliquerSchema, type Bdd } from '../bdd/connexion.js';
import { listerCatalogue, listerFamilles, rechercher } from '../bdd/recherche.js';
import {
  changerStatut,
  creerDocument,
  listerDocuments,
  mettreAJourDocument,
  obtenirDocument,
  statistiques,
  TYPE_PAR_DEFAUT,
  TYPES_DOCUMENT,
  type TypeDocument,
} from '../bdd/documents.js';
import { validerFichier } from '../import/schema.js';
import { extraire } from '../import/extraction.js';
import { construireLots } from '../import/lots.js';
import { construireRapport } from '../import/rapport.js';
import { ingererImportInitial } from '../bdd/ingestion.js';

/**
 * API interne de l'application.
 *
 * Regle de confiance : le navigateur envoie des intentions (quel produit,
 * quelle quantite, quel prix applique), jamais des resultats. Les sous-totaux
 * et le total general sont recalcules cote serveur a chaque enregistrement.
 * Un navigateur avec un onglet reste ouvert pendant une heure, une extension
 * qui modifie la page, une requete rejouee : aucun de ces cas ne doit pouvoir
 * inscrire un total faux dans un document.
 */

const ligneSchema = z.object({
  tarifId: z.number().int().nullable().default(null),
  produitId: z.number().int().nullable().default(null),
  nomProduit: z.string().min(1, 'Le nom du produit est obligatoire.').max(300),
  reference: z.string().max(100).nullable().default(null),
  fournisseur: z.string().max(100).nullable().default(null),
  unite: z.string().max(30).nullable().default(null),
  prixCatalogueCentimes: z.number().int().min(0).nullable().default(null),
  prixUnitaireCentimes: z.number().int().min(0, 'Le prix ne peut pas etre negatif.'),
  quantiteMilliemes: z
    .number()
    .int()
    .min(1, 'La quantite doit etre superieure a zero.')
    .max(1_000_000_000),
});

const documentSchema = z.object({
  // L'application ne produit que des bons de commande : le navigateur n'a pas
  // a envoyer le type, et une autre valeur est refusee.
  type: z
    .enum(TYPES_DOCUMENT as unknown as [TypeDocument, ...TypeDocument[]])
    .default(TYPE_PAR_DEFAUT),
  dateDocument: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.'),
  tiersLibelle: z.string().max(200).nullable().default(null),
  notes: z.string().max(5000).nullable().default(null),
  statut: z.enum(['brouillon', 'finalise', 'annule']).default('brouillon'),
  lignes: z.array(ligneSchema).max(500),
});

export type OptionsServeur = {
  cheminBdd: string;
  port?: number;
  hote?: string;
  dossierWeb?: string;
};

export function construireServeur(bdd: Bdd, dossierWeb?: string) {
  const app = Fastify({ logger: false, bodyLimit: 100 * 1024 * 1024 });

  // Autorise les requêtes cross-origin depuis l'extension Chrome (qui tourne
  // dans le contexte de verifk7.krkfr.net) et depuis localhost en dev.
  app.register(fastifyCors, { origin: true });

  app.setErrorHandler((erreur, _requete, reponse) => {
    // Les messages techniques ne remontent jamais tels quels a l'ecran : ils
    // n'aident pas l'utilisateur et exposent le fonctionnement interne.
    const estMetier = erreur instanceof Error && erreur.message.includes('finalise');
    const code = estMetier ? 409 : 500;
    if (!estMetier) console.error('Erreur serveur :', erreur);
    reponse.status(code).send({
      erreur: estMetier
        ? erreur.message
        : "Une erreur est survenue. L'operation n'a pas ete enregistree.",
    });
  });

  app.get('/api/statistiques', async () => statistiques(bdd));

  app.get('/api/recherche', async (requete) => {
    const parametres = z
      .object({ q: z.string().default(''), limite: z.coerce.number().int().min(1).max(50).default(20) })
      .parse(requete.query);
    return { resultats: rechercher(bdd, parametres.q, parametres.limite) };
  });

  app.get('/api/catalogue', async (requete) => {
    const parametres = z
      .object({
        recherche: z.string().optional(),
        famille: z.string().optional(),
        inclureInactifs: z.coerce.boolean().optional(),
        page: z.coerce.number().int().min(1).default(1),
        parPage: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(requete.query);
    return listerCatalogue(bdd, parametres);
  });

  app.get('/api/familles', async () => ({ familles: listerFamilles(bdd) }));

  app.get('/api/documents', async (requete) => {
    const parametres = z
      .object({
        recherche: z.string().optional(),
        statut: z.enum(['brouillon', 'finalise', 'annule']).optional(),
      })
      .parse(requete.query);
    return { documents: listerDocuments(bdd, parametres) };
  });

  app.get('/api/documents/:id', async (requete, reponse) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(requete.params);
    const document = obtenirDocument(bdd, id);
    if (!document) return reponse.status(404).send({ erreur: 'Document introuvable.' });
    return document;
  });

  app.post('/api/documents', async (requete, reponse) => {
    const analyse = documentSchema.safeParse(requete.body);
    if (!analyse.success) {
      return reponse.status(400).send({ erreur: premierMessage(analyse.error) });
    }
    return creerDocument(bdd, analyse.data);
  });

  app.put('/api/documents/:id', async (requete, reponse) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(requete.params);
    const analyse = documentSchema.safeParse(requete.body);
    if (!analyse.success) {
      return reponse.status(400).send({ erreur: premierMessage(analyse.error) });
    }
    const document = mettreAJourDocument(bdd, id, analyse.data);
    if (!document) return reponse.status(404).send({ erreur: 'Document introuvable.' });
    return document;
  });

  app.post('/api/documents/:id/statut', async (requete, reponse) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(requete.params);
    const analyse = z
      .object({ statut: z.enum(['brouillon', 'finalise', 'annule']) })
      .safeParse(requete.body);
    if (!analyse.success) return reponse.status(400).send({ erreur: 'Statut inconnu.' });

    const document = changerStatut(bdd, id, analyse.data.statut);
    if (!document) return reponse.status(404).send({ erreur: 'Document introuvable.' });
    return document;
  });

  app.post('/api/import/tarifs', async (requete, reponse) => {
    const cleAttendue = process.env['VERIF_API_KEY'];
    if (!cleAttendue) {
      return reponse.status(503).send({
        erreur: "Import desactive : variable d'environnement VERIF_API_KEY non definie.",
      });
    }
    if (requete.headers['x-api-key'] !== cleAttendue) {
      return reponse.status(401).send({ erreur: 'Cle API invalide.' });
    }

    const corps = requete.body as unknown;
    const tailleOctets = Buffer.byteLength(JSON.stringify(corps));

    const validation = validerFichier(corps);
    if (!validation.ok) {
      return reponse.status(400).send({
        erreur: `Donnees invalides : ${validation.problemes[0]?.message ?? 'format inconnu'}`,
      });
    }

    const aujourd = new Date();
    const extraction = extraire(validation.fichier.rows, aujourd);
    const lots = construireLots(extraction.tarifs);
    const nomFichier = `push_${aujourd.toISOString().replace(/[:.]/g, '-')}.json`;
    const rapport = construireRapport({
      nomFichier,
      tailleOctets,
      fichier: validation.fichier,
      extraction,
      lots,
      avertissements: validation.avertissements,
    });

    const ingestion = ingererImportInitial(bdd, extraction, rapport, { remplacer: true });

    return {
      ok: true,
      importId: ingestion.importId,
      produits: ingestion.produitsInseres,
      tiers: ingestion.tiersInseres,
      tarifs: ingestion.tarifsInseres,
      avertissements: rapport.avertissements,
    };
  });

  if (dossierWeb && existsSync(dossierWeb)) {
    app.register(fastifyStatic, { root: dossierWeb });
    // L'interface est une application a page unique : toute route inconnue
    // qui n'est pas une API doit lui rendre la main.
    app.setNotFoundHandler(async (requete, reponse) => {
      if (requete.url.startsWith('/api/')) {
        return reponse.status(404).send({ erreur: 'Route inconnue.' });
      }
      return reponse.sendFile('index.html');
    });
  }

  return app;
}

function premierMessage(erreur: z.ZodError): string {
  return erreur.issues[0]?.message ?? 'Donnees invalides.';
}

export async function demarrerServeur(options: OptionsServeur) {
  const bdd = ouvrirBdd(options.cheminBdd);
  appliquerSchema(bdd);

  const app = construireServeur(bdd, options.dossierWeb);
  const port = options.port ?? 4173;
  const hote = options.hote ?? '0.0.0.0';

  await app.listen({ port, host: hote });
  return { app, bdd, port };
}

const estPointDEntree = process.argv[1] && resolve(process.argv[1]).endsWith('serveur.ts');
if (estPointDEntree) {
  const cheminBdd = resolve(process.env['VERIF_BDD'] ?? 'data/verif.db');
  const dossierWeb = resolve('web/dist');
  const port = Number(process.env['PORT'] ?? 4173);

  demarrerServeur({ cheminBdd, port, dossierWeb })
    .then(() => {
      console.log(`\n  Verif Achats demarre`);
      console.log(`  Base      : ${cheminBdd}`);
      console.log(`  Interface : http://localhost:${port}`);
      console.log(`  Reseau    : accessible depuis les autres postes sur le port ${port}\n`);
    })
    .catch((erreur: unknown) => {
      console.error('Impossible de demarrer le serveur :', erreur);
      process.exitCode = 1;
    });
}
