import { useEffect, useState } from 'react';
import { api, type EnteteDocument, type Statistiques } from '../api';
import { formaterAriary } from '@domaine/monnaie';
import { Badge, Bouton, Carte, EtatVide } from '../composants/Ui';

function Compteur({ valeur, libelle, ton }: { valeur: string; libelle: string; ton?: 'alerte' }) {
  return (
    <Carte className="p-5">
      <div className={`chiffres text-3xl font-bold ${ton === 'alerte' ? 'text-amber-700' : ''}`}>
        {valeur}
      </div>
      <div className="mt-1 text-sm text-ardoise-400">{libelle}</div>
    </Carte>
  );
}

export function TableauDeBord() {
  const [stats, setStats] = useState<Statistiques | null>(null);
  const [recents, setRecents] = useState<EnteteDocument[]>([]);

  useEffect(() => {
    api.statistiques().then(setStats).catch(() => setStats(null));
    api.documents().then((documents) => setRecents(documents.slice(0, 5))).catch(() => setRecents([]));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tableau de bord</h1>
          <p className="text-sm text-ardoise-400">
            {stats?.derniereSynchronisation
              ? `Catalogue synchronisé le ${new Date(stats.derniereSynchronisation).toLocaleString('fr-FR')}`
              : 'Catalogue non synchronisé'}
          </p>
        </div>
        <Bouton variante="principal" onClick={() => (window.location.hash = '#/operation')}>
          + Nouveau bon de commande
        </Bouton>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Compteur valeur={String(stats?.produitsActifs ?? '—')} libelle="Produits au catalogue" />
        <Compteur valeur={String(stats?.tarifsAvecPrix ?? '—')} libelle="Tarifs avec un prix" />
        <Compteur
          valeur={String(stats?.prixAVerifier ?? '—')}
          libelle="Prix dont l’échelle reste à trancher"
          ton="alerte"
        />
        <Compteur
          valeur={String((stats?.documentsBrouillon ?? 0) + (stats?.documentsFinalises ?? 0))}
          libelle="Bons de commande enregistrés"
        />
      </div>

      {stats && stats.prixAVerifier > 0 && (
        <Carte className="mb-6 border-l-4 border-amber-400 p-4">
          <p className="text-sm text-ardoise-800">
            <strong>{stats.prixAVerifier} tarifs</strong> ont été saisis dans Verif K7 sans qu’on
            puisse déterminer s’ils sont en ariary ou en milliers d’ariary. Ils apparaissent avec un
            badge <Badge ton="alerte">prix à vérifier</Badge> partout dans l’application, jusqu’à ce
            qu’ils soient tranchés.
          </p>
        </Carte>
      )}

      <Carte className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-ardoise-100 px-4 py-3">
          <h2 className="font-medium">Bons de commande récents</h2>
          <button
            onClick={() => (window.location.hash = '#/historique')}
            className="text-sm text-accent-600 hover:underline"
          >
            Tout voir
          </button>
        </div>

        {recents.length === 0 ? (
          <EtatVide
            titre="Aucun bon de commande pour l’instant"
            detail="Créez votre premier bon de commande pour le voir apparaître ici."
          />
        ) : (
          <ul className="divide-y divide-ardoise-100">
            {recents.map((document) => (
              <li key={document.id}>
                <button
                  onClick={() => (window.location.hash = `#/operation/${document.id}`)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-accent-50/50"
                >
                  <span className="w-32 font-medium">{document.numero}</span>
                  <span className="flex-1 truncate text-sm text-ardoise-600">
                    {document.tiersLibelle ?? '—'} · {document.nombreLignes} ligne
                    {document.nombreLignes > 1 ? 's' : ''}
                  </span>
                  <span className="chiffres font-semibold">
                    {formaterAriary(document.totalCentimes)}
                  </span>
                  <Badge ton={document.statut === 'finalise' ? 'succes' : 'info'}>
                    {document.statut}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Carte>
    </div>
  );
}
