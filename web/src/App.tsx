import { useEffect, useState } from 'react';
import { TableauDeBord } from './pages/TableauDeBord';
import { NouvelleOperation } from './pages/NouvelleOperation';
import { Historique } from './pages/Historique';
import { Catalogue } from './pages/Catalogue';

/**
 * Routage par ancre (#/...).
 *
 * Volontairement minimal : quatre ecrans ne justifient pas une bibliotheque
 * de routage. L'ancre a en plus l'avantage de fonctionner sans configuration
 * cote serveur, y compris si l'application est ouverte depuis un fichier ou
 * derriere un chemin inattendu sur le reseau interne.
 */

type Route =
  | { nom: 'accueil' }
  | { nom: 'operation'; id?: number }
  | { nom: 'historique' }
  | { nom: 'catalogue' };

function lireRoute(): Route {
  const ancre = window.location.hash.replace(/^#\/?/, '');
  const [segment, parametre] = ancre.split('/');

  switch (segment) {
    case 'operation':
      return { nom: 'operation', id: parametre ? Number(parametre) : undefined };
    case 'historique':
      return { nom: 'historique' };
    case 'catalogue':
      return { nom: 'catalogue' };
    default:
      return { nom: 'accueil' };
  }
}

const ONGLETS = [
  { ancre: '#/', libelle: 'Tableau de bord', nom: 'accueil' },
  { ancre: '#/operation', libelle: 'Nouveau bon', nom: 'operation' },
  { ancre: '#/historique', libelle: 'Historique', nom: 'historique' },
  { ancre: '#/catalogue', libelle: 'Catalogue', nom: 'catalogue' },
] as const;

export function App() {
  const [route, setRoute] = useState<Route>(lireRoute);

  useEffect(() => {
    const surChangement = () => setRoute(lireRoute());
    window.addEventListener('hashchange', surChangement);
    return () => window.removeEventListener('hashchange', surChangement);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-ardoise-200 bg-white sans-impression">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <a href="#/" className="flex items-center gap-2 font-semibold text-ardoise-900">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-accent-600 text-sm text-white">
              VA
            </span>
            Verif Achats
          </a>

          <nav className="flex flex-wrap gap-1">
            {ONGLETS.map((onglet) => {
              const actif = route.nom === onglet.nom;
              return (
                <a
                  key={onglet.ancre}
                  href={onglet.ancre}
                  aria-current={actif ? 'page' : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${
                    actif
                      ? 'bg-accent-50 font-medium text-accent-700'
                      : 'text-ardoise-600 hover:bg-ardoise-100'
                  }`}
                >
                  {onglet.libelle}
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      <main>
        {route.nom === 'accueil' && <TableauDeBord />}
        {route.nom === 'operation' && (
          // La cle force un remontage quand on passe d'un document a un autre :
          // sans elle, l'ecran garderait les lignes du document precedent.
          <NouvelleOperation key={route.id ?? 'nouveau'} documentId={route.id} />
        )}
        {route.nom === 'historique' && <Historique />}
        {route.nom === 'catalogue' && <Catalogue />}
      </main>
    </div>
  );
}
