import { useEffect, useState } from 'react';
import { api, type EnteteDocument } from '../api';
import { formaterAriary } from '@domaine/monnaie';
import { Badge, Carte, classesChamp, EtatVide } from '../composants/Ui';

export function Historique() {
  const [documents, setDocuments] = useState<EnteteDocument[]>([]);
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState('');
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    const minuterie = setTimeout(() => {
      api
        .documents({ recherche: recherche || undefined, statut: statut || undefined })
        .then((trouves) => {
          if (!annule) setDocuments(trouves);
        })
        .finally(() => {
          if (!annule) setChargement(false);
        });
    }, 160);

    return () => {
      annule = true;
      clearTimeout(minuterie);
    };
  }, [recherche, statut]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="mb-1 text-2xl font-semibold">Historique des bons de commande</h1>
      <p className="mb-5 text-sm text-ardoise-400">
        Recherchez par numéro, fournisseur, note — ou par un produit contenu dans le document.
      </p>

      <Carte className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={recherche}
            onChange={(evenement) => setRecherche(evenement.target.value)}
            placeholder="Numéro, fournisseur, produit…"
            aria-label="Rechercher dans l'historique"
            className={classesChamp}
          />
          <select
            value={statut}
            onChange={(evenement) => setStatut(evenement.target.value)}
            className={classesChamp}
          >
            <option value="">Tous les statuts</option>
            <option value="brouillon">Brouillon</option>
            <option value="finalise">Finalisé</option>
            <option value="annule">Annulé</option>
          </select>
        </div>
      </Carte>

      <Carte className="overflow-hidden">
        {chargement && documents.length === 0 ? (
          <EtatVide titre="Chargement…" />
        ) : documents.length === 0 ? (
          <EtatVide
            titre="Aucun bon de commande trouvé"
            detail="Modifiez la recherche, ou créez un nouveau bon de commande."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ardoise-200 bg-ardoise-50 text-left text-xs uppercase tracking-wide text-ardoise-400">
                  <th className="px-4 py-2.5 font-medium">Numéro</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Fournisseur</th>
                  <th className="px-4 py-2.5 text-right font-medium">Lignes</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ardoise-100">
                {documents.map((document) => (
                  <tr
                    key={document.id}
                    onClick={() => {
                      window.location.hash = `#/operation/${document.id}`;
                    }}
                    className="cursor-pointer hover:bg-accent-50/50"
                  >
                    <td className="px-4 py-2.5 font-medium">{document.numero}</td>
                    <td className="px-4 py-2.5 text-ardoise-600">
                      {new Date(document.dateDocument).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-2.5 text-ardoise-600">{document.tiersLibelle ?? '—'}</td>
                    <td className="chiffres px-4 py-2.5 text-right text-ardoise-600">
                      {document.nombreLignes}
                    </td>
                    <td className="chiffres px-4 py-2.5 text-right font-semibold">
                      {formaterAriary(document.totalCentimes)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        ton={
                          document.statut === 'finalise'
                            ? 'succes'
                            : document.statut === 'annule'
                              ? 'archive'
                              : 'info'
                        }
                      >
                        {document.statut}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </div>
  );
}
