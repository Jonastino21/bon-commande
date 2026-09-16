import { useEffect, useRef, useState } from 'react';
import { api, type Offre, type ResultatRecherche } from '../api';
import { formaterAriary } from '@domaine/monnaie';
import { Badge, classesChamp } from './Ui';

/**
 * Barre de recherche a suggestions.
 *
 * Objectif d'ergonomie : composer un document de dix lignes sans jamais
 * quitter le clavier. Fleches pour parcourir, Entree pour ajouter le meilleur
 * tarif, Tab pour deplier les fournisseurs et en choisir un autre, Echap pour
 * refermer.
 */

export type ChoixProduit = { resultat: ResultatRecherche; offre: Offre };

const DELAI_ANTI_REBOND_MS = 140;

export function RechercheProduit({ onChoisir }: { onChoisir: (choix: ChoixProduit) => void }) {
  const [saisie, setSaisie] = useState('');
  const [resultats, setResultats] = useState<ResultatRecherche[]>([]);
  const [indexActif, setIndexActif] = useState(0);
  const [deplie, setDeplie] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const champRef = useRef<HTMLInputElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (saisie.trim().length === 0) {
      setResultats([]);
      return;
    }

    // Anti-rebond : on ne lance une requete que lorsque la frappe se calme,
    // sinon chaque lettre declenche un appel et les reponses arrivent dans le
    // desordre.
    let annule = false;
    setChargement(true);
    const minuterie = setTimeout(() => {
      api
        .rechercher(saisie)
        .then((trouves) => {
          if (annule) return;
          setResultats(trouves);
          setIndexActif(0);
          setDeplie(null);
        })
        .catch(() => {
          if (!annule) setResultats([]);
        })
        .finally(() => {
          if (!annule) setChargement(false);
        });
    }, DELAI_ANTI_REBOND_MS);

    return () => {
      annule = true;
      clearTimeout(minuterie);
    };
  }, [saisie]);

  // Le raccourci "/" ramene le curseur dans la recherche depuis n'importe ou
  // dans l'ecran, sauf si l'utilisateur est deja en train de taper ailleurs.
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      const cible = evenement.target as HTMLElement | null;
      const dansUnChamp =
        cible?.tagName === 'INPUT' || cible?.tagName === 'TEXTAREA' || cible?.isContentEditable;
      if (evenement.key === '/' && !dansUnChamp) {
        evenement.preventDefault();
        champRef.current?.focus();
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, []);

  useEffect(() => {
    listeRef.current
      ?.querySelector(`[data-index="${indexActif}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [indexActif]);

  function choisir(resultat: ResultatRecherche, offre: Offre | undefined) {
    if (!offre) return;
    onChoisir({ resultat, offre });
    setSaisie('');
    setResultats([]);
    setDeplie(null);
    champRef.current?.focus();
  }

  function surTouche(evenement: React.KeyboardEvent<HTMLInputElement>) {
    if (resultats.length === 0) return;

    switch (evenement.key) {
      case 'ArrowDown':
        evenement.preventDefault();
        setIndexActif((index) => (index + 1) % resultats.length);
        break;
      case 'ArrowUp':
        evenement.preventDefault();
        setIndexActif((index) => (index - 1 + resultats.length) % resultats.length);
        break;
      case 'Enter': {
        evenement.preventDefault();
        const resultat = resultats[indexActif];
        if (resultat) choisir(resultat, resultat.offres[0]);
        break;
      }
      // Fleche droite / gauche pour deplier les fournisseurs, comme dans une
      // arborescence. Tab garde son role normal — deplacer le focus — parce
      // que le detourner desoriente quiconque navigue au clavier et casse le
      // fonctionnement des lecteurs d'ecran.
      case 'ArrowRight': {
        const resultat = resultats[indexActif];
        if (resultat && resultat.offres.length > 1) {
          evenement.preventDefault();
          setDeplie(resultat.cle);
        }
        break;
      }
      case 'ArrowLeft': {
        if (deplie) {
          evenement.preventDefault();
          setDeplie(null);
        }
        break;
      }
      case 'Escape':
        setResultats([]);
        setSaisie('');
        break;
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-ardoise-400">
          ⌕
        </span>
        <input
          ref={champRef}
          value={saisie}
          onChange={(evenement) => setSaisie(evenement.target.value)}
          onKeyDown={surTouche}
          placeholder="Rechercher un produit par nom ou référence…"
          aria-label="Rechercher un produit"
          autoComplete="off"
          className={`${classesChamp} !py-4 !pl-12 !pr-24 text-lg shadow-sm`}
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-ardoise-400">
          {chargement ? 'recherche…' : 'touche /'}
        </span>
      </div>

      {resultats.length > 0 && (
        <ul
          ref={listeRef}
          role="listbox"
          className="absolute z-20 mt-2 max-h-[26rem] w-full overflow-y-auto rounded-xl bg-white p-1 shadow-lg ring-1 ring-ardoise-200"
        >
          {resultats.map((resultat, index) => {
            const actif = index === indexActif;
            const ouvert = deplie === resultat.cle;
            const meilleure = resultat.offres[0];

            return (
              <li key={resultat.cle} data-index={index} role="option" aria-selected={actif}>
                <div
                  onMouseEnter={() => setIndexActif(index)}
                  onClick={() => choisir(resultat, meilleure)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ${
                    actif ? 'bg-accent-50' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ardoise-900">{resultat.libelle}</span>
                      {resultat.codeProduit && (
                        <span className="text-xs text-ardoise-400">{resultat.codeProduit}</span>
                      )}
                      {resultat.prixAVerifier && <Badge ton="alerte">prix à vérifier</Badge>}
                      {resultat.tousTarifsArchives && <Badge ton="archive">tarif archivé</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-ardoise-400">
                      {resultat.offres.length > 1
                        ? `${resultat.offres.length} fournisseurs — → pour comparer`
                        : (meilleure?.fournisseurCode ?? 'sans fournisseur')}
                      {resultat.famille ? ` · ${resultat.famille}` : ''}
                    </div>
                  </div>

                  <div className="chiffres shrink-0 text-right">
                    {meilleure?.prixCentimes !== null && meilleure?.prixCentimes !== undefined ? (
                      <span className="font-semibold text-ardoise-900">
                        {formaterAriary(meilleure.prixCentimes)}
                      </span>
                    ) : (
                      <span className="text-sm text-ardoise-400">sans prix</span>
                    )}
                  </div>
                </div>

                {ouvert && (
                  <ul className="mb-1 ml-3 border-l-2 border-accent-100 pl-3">
                    {resultat.offres.map((offre) => (
                      <li key={offre.tarifId}>
                        <button
                          onClick={() => choisir(resultat, offre)}
                          className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-ardoise-50"
                        >
                          <span className="flex-1 text-ardoise-600">
                            {offre.fournisseurCode ?? 'sans fournisseur'}
                            {offre.dateTarif && (
                              <span className="ml-2 text-xs text-ardoise-400">{offre.dateTarif}</span>
                            )}
                            {!offre.actif && (
                              <span className="ml-2">
                                <Badge ton="archive">archivé</Badge>
                              </span>
                            )}
                          </span>
                          <span className="chiffres font-medium">
                            {offre.prixCentimes !== null ? formaterAriary(offre.prixCentimes) : '—'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
