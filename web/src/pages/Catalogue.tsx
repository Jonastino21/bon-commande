import { Fragment, useEffect, useState } from 'react';
import { api, type ResultatRecherche } from '../api';
import { formaterAriary } from '@domaine/monnaie';
import { Badge, Bouton, Carte, classesChamp, EtatVide } from '../composants/Ui';

export function Catalogue() {
  const [resultats, setResultats] = useState<ResultatRecherche[]>([]);
  const [familles, setFamilles] = useState<Array<{ famille: string; nombre: number }>>([]);
  const [recherche, setRecherche] = useState('');
  const [famille, setFamille] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deplie, setDeplie] = useState<string | null>(null);
  const parPage = 50;

  useEffect(() => {
    api.familles().then(setFamilles).catch(() => setFamilles([]));
  }, []);

  useEffect(() => {
    let annule = false;
    const minuterie = setTimeout(() => {
      api
        .catalogue({ recherche: recherche || undefined, famille: famille || undefined, page, parPage })
        .then((reponse) => {
          if (annule) return;
          setResultats(reponse.resultats);
          setTotal(reponse.total);
        })
        .catch(() => {
          if (!annule) setResultats([]);
        });
    }, 160);
    return () => {
      annule = true;
      clearTimeout(minuterie);
    };
  }, [recherche, famille, page]);

  useEffect(() => setPage(1), [recherche, famille]);

  const nombrePages = Math.max(1, Math.ceil(total / parPage));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="mb-1 text-2xl font-semibold">Catalogue produits</h1>
      <p className="mb-5 text-sm text-ardoise-400">
        {total} produit{total > 1 ? 's' : ''} importé{total > 1 ? 's' : ''} depuis Verif K7.
      </p>

      <Carte className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={recherche}
            onChange={(evenement) => setRecherche(evenement.target.value)}
            placeholder="Rechercher un produit…"
            aria-label="Rechercher dans le catalogue"
            className={classesChamp}
          />
          <select
            value={famille}
            onChange={(evenement) => setFamille(evenement.target.value)}
            className={classesChamp}
          >
            <option value="">Toutes les familles</option>
            {familles.map((entree) => (
              <option key={entree.famille} value={entree.famille}>
                {entree.famille} ({entree.nombre})
              </option>
            ))}
          </select>
        </div>
      </Carte>

      <Carte className="overflow-hidden">
        {resultats.length === 0 ? (
          <EtatVide titre="Aucun produit" detail="Modifiez la recherche ou le filtre de famille." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ardoise-200 bg-ardoise-50 text-left text-xs uppercase tracking-wide text-ardoise-400">
                  <th className="px-4 py-2.5 font-medium">Produit</th>
                  <th className="px-4 py-2.5 font-medium">Référence</th>
                  <th className="px-4 py-2.5 font-medium">Famille</th>
                  <th className="px-4 py-2.5 text-right font-medium">Fournisseurs</th>
                  <th className="px-4 py-2.5 text-right font-medium">Meilleur prix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ardoise-100">
                {resultats.map((resultat) => (
                  <Fragment key={resultat.cle}>
                    <tr
                      onClick={() =>
                        setDeplie((courant) => (courant === resultat.cle ? null : resultat.cle))
                      }
                      className="cursor-pointer hover:bg-accent-50/50"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{resultat.libelle}</span>
                          {resultat.prixAVerifier && <Badge ton="alerte">prix à vérifier</Badge>}
                          {resultat.tousTarifsArchives && <Badge ton="archive">archivé</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-ardoise-400">{resultat.codeProduit ?? '—'}</td>
                      <td className="px-4 py-2.5 text-ardoise-600">{resultat.famille ?? '—'}</td>
                      <td className="chiffres px-4 py-2.5 text-right text-ardoise-600">
                        {resultat.offres.length}
                      </td>
                      <td className="chiffres px-4 py-2.5 text-right font-semibold">
                        {resultat.meilleurPrixCentimes !== null
                          ? formaterAriary(resultat.meilleurPrixCentimes)
                          : '—'}
                      </td>
                    </tr>
                    {deplie === resultat.cle && resultat.offres.length > 0 && (
                      <tr className="bg-ardoise-50/60">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="mb-2 text-xs uppercase tracking-wide text-ardoise-400">
                            Tarifs connus
                          </div>
                          <ul className="space-y-1">
                            {resultat.offres.map((offre) => (
                              <li key={offre.tarifId} className="flex items-center gap-3 text-sm">
                                <span className="w-32 text-ardoise-600">
                                  {offre.fournisseurCode ?? '—'}
                                </span>
                                <span className="chiffres w-36 text-right font-medium">
                                  {offre.prixCentimes !== null ? formaterAriary(offre.prixCentimes) : '—'}
                                </span>
                                <span className="w-24 text-xs text-ardoise-400">
                                  {offre.dateTarif ?? ''}
                                </span>
                                {!offre.actif && <Badge ton="archive">archivé</Badge>}
                                {offre.echelleIncertaine && <Badge ton="alerte">à vérifier</Badge>}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      {nombrePages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Bouton disabled={page <= 1} onClick={() => setPage((courante) => courante - 1)}>
            Précédent
          </Bouton>
          <span className="text-sm text-ardoise-600">
            Page {page} sur {nombrePages}
          </span>
          <Bouton disabled={page >= nombrePages} onClick={() => setPage((courante) => courante + 1)}>
            Suivant
          </Bouton>
        </div>
      )}
    </div>
  );
}
