import { useEffect, useMemo, useState } from 'react';
import { api, ErreurApi, type DocumentComplet, type LigneDocument } from '../api';
import {
  formaterAriary,
  MILLIEMES_PAR_UNITE,
  quantiteEnMilliemes,
  sousTotal,
  totalGeneral,
} from '@domaine/monnaie';
import {
  fournisseurAProposer,
  fournisseursDistincts,
  melangeFournisseurs,
} from '@domaine/document';
import { RechercheProduit, type ChoixProduit } from '../composants/RechercheProduit';
import { Badge, Bouton, Carte, classesChamp, Etiquette, Message } from '../composants/Ui';

function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NouvelleOperation({ documentId }: { documentId?: number }) {
  const [dateDocument, setDateDocument] = useState(aujourdhui());
  const [tiersLibelle, setTiersLibelle] = useState('');
  const [fournisseurAutoRempli, setFournisseurAutoRempli] = useState(false);
  const [notes, setNotes] = useState('');
  const [lignes, setLignes] = useState<LigneDocument[]>([]);
  const [enregistre, setEnregistre] = useState<DocumentComplet | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    if (!documentId) return;
    api
      .document(documentId)
      .then((document) => {
        setEnregistre(document);
        setDateDocument(document.dateDocument);
        setTiersLibelle(document.tiersLibelle ?? '');
        setFournisseurAutoRempli(false);
        setNotes(document.notes ?? '');
        setLignes(document.lignes);
      })
      .catch((cause: unknown) => setErreur(cause instanceof ErreurApi ? cause.message : 'Erreur.'));
  }, [documentId]);

  const fige = enregistre?.statut === 'finalise';

  // Le total est recalcule a chaque rendu a partir des lignes, avec le meme
  // module que le serveur. Aucun total n'est conserve dans l'etat : il ne
  // peut donc pas se desynchroniser de ce que l'utilisateur voit.
  const sousTotaux = useMemo(
    () => lignes.map((ligne) => sousTotal(ligne.prixUnitaireCentimes, ligne.quantiteMilliemes)),
    [lignes],
  );
  const total = useMemo(() => totalGeneral(sousTotaux), [sousTotaux]);
  const quantiteTotale = useMemo(
    () => lignes.reduce((somme, ligne) => somme + ligne.quantiteMilliemes, 0) / MILLIEMES_PAR_UNITE,
    [lignes],
  );
  const fournisseurs = useMemo(() => fournisseursDistincts(lignes), [lignes]);
  const melange = useMemo(() => melangeFournisseurs(lignes), [lignes]);

  function ajouter({ resultat, offre }: ChoixProduit) {
    setSucces(null);

    // La premiere ligne ajoutee renseigne l'en-tete, tant qu'il est vide.
    const propose = fournisseurAProposer(tiersLibelle, lignes, offre.fournisseurCode);
    if (propose) {
      setTiersLibelle(propose);
      setFournisseurAutoRempli(true);
    }

    setLignes((courantes) => {
      // Le meme produit chez le meme fournisseur incremente la ligne existante
      // plutot que d'en creer une seconde : c'est le comportement attendu
      // quand on ajoute deux fois de suite sans y penser.
      const index = courantes.findIndex(
        (ligne) => ligne.tarifId === offre.tarifId && !ligne.prixModifieManuellement,
      );
      if (index >= 0) {
        const copie = [...courantes];
        const existante = copie[index]!;
        copie[index] = {
          ...existante,
          quantiteMilliemes: existante.quantiteMilliemes + MILLIEMES_PAR_UNITE,
        };
        return copie;
      }

      return [
        ...courantes,
        {
          tarifId: offre.tarifId,
          produitId: resultat.produitId,
          nomProduit: resultat.libelle,
          reference: resultat.codeProduit,
          fournisseur: offre.fournisseurCode,
          unite: resultat.unite,
          prixCatalogueCentimes: offre.prixCentimes,
          prixUnitaireCentimes: offre.prixCentimes ?? 0,
          quantiteMilliemes: MILLIEMES_PAR_UNITE,
        },
      ];
    });
  }

  function modifierLigne(index: number, champs: Partial<LigneDocument>) {
    setLignes((courantes) => courantes.map((ligne, i) => (i === index ? { ...ligne, ...champs } : ligne)));
  }

  function supprimerLigne(index: number) {
    setLignes((courantes) => courantes.filter((_, i) => i !== index));
  }

  async function enregistrer(statut: 'brouillon' | 'finalise') {
    if (lignes.length === 0) {
      setErreur('Ajoutez au moins un produit avant d’enregistrer.');
      return;
    }
    const sansPrix = lignes.some((ligne) => ligne.prixUnitaireCentimes <= 0);
    if (sansPrix) {
      setErreur('Une ligne est à 0. Saisissez un prix ou supprimez-la.');
      return;
    }

    setOccupe(true);
    setErreur(null);
    const corps = {
      dateDocument,
      tiersLibelle: tiersLibelle || null,
      notes: notes || null,
      statut,
      lignes: lignes.map((ligne) => ({
        tarifId: ligne.tarifId,
        produitId: ligne.produitId,
        nomProduit: ligne.nomProduit,
        reference: ligne.reference,
        fournisseur: ligne.fournisseur,
        unite: ligne.unite,
        prixCatalogueCentimes: ligne.prixCatalogueCentimes,
        prixUnitaireCentimes: ligne.prixUnitaireCentimes,
        quantiteMilliemes: ligne.quantiteMilliemes,
      })),
    };

    try {
      const document = enregistre
        ? await api.modifierDocument(enregistre.id, corps)
        : await api.creerDocument(corps);
      setEnregistre(document);
      setLignes(document.lignes);
      setSucces(
        statut === 'finalise'
          ? `Document ${document.numero} finalisé.`
          : `Brouillon ${document.numero} enregistré.`,
      );
      if (!documentId) window.location.hash = `#/operation/${document.id}`;
    } catch (cause) {
      setErreur(cause instanceof ErreurApi ? cause.message : "L'enregistrement a échoué.");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-44 pt-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 sans-impression">
        <div>
          <h1 className="text-2xl font-semibold">
            {enregistre ? enregistre.numero : 'Nouveau bon de commande'}
          </h1>
          <p className="text-sm text-ardoise-400">
            {enregistre
              ? `Créé le ${new Date(enregistre.creeLe).toLocaleDateString('fr-FR')}`
              : 'Le numéro sera attribué à l’enregistrement'}
          </p>
        </div>
        {enregistre && (
          <Badge ton={enregistre.statut === 'finalise' ? 'succes' : enregistre.statut === 'annule' ? 'archive' : 'info'}>
            {enregistre.statut}
          </Badge>
        )}
      </div>

      {erreur && (
        <div className="mb-4 sans-impression">
          <Message ton="erreur" onFermer={() => setErreur(null)}>
            {erreur}
          </Message>
        </div>
      )}
      {succes && (
        <div className="mb-4 sans-impression">
          <Message ton="succes" onFermer={() => setSucces(null)}>
            {succes}
          </Message>
        </div>
      )}

      <Carte className="mb-5 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Etiquette>Date</Etiquette>
            <input
              type="date"
              value={dateDocument}
              disabled={fige}
              onChange={(evenement) => setDateDocument(evenement.target.value)}
              className={classesChamp}
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <label className="text-sm font-medium text-ardoise-600">Fournisseur</label>
              {fournisseurAutoRempli && !fige && <Badge ton="info">rempli automatiquement</Badge>}
            </div>
            <input
              value={tiersLibelle}
              disabled={fige}
              onChange={(evenement) => {
                setTiersLibelle(evenement.target.value);
                setFournisseurAutoRempli(false);
              }}
              placeholder="ex. FIBASO4001"
              className={classesChamp}
            />
          </div>
          <div>
            <Etiquette>Note (facultatif)</Etiquette>
            <input
              value={notes}
              disabled={fige}
              onChange={(evenement) => setNotes(evenement.target.value)}
              className={classesChamp}
            />
          </div>
        </div>
      </Carte>

      {!fige && (
        <div className="mb-5 sans-impression">
          <RechercheProduit onChoisir={ajouter} />
          <p className="mt-2 text-xs text-ardoise-400">
            ↑ ↓ pour parcourir · Entrée pour ajouter au meilleur prix · → pour comparer les
            fournisseurs · Échap pour annuler
          </p>
        </div>
      )}

      {melange && (
        <div className="mb-4 sans-impression">
          <Message ton="alerte">
            Ce bon mélange <strong>{fournisseurs.length} fournisseurs</strong> :{' '}
            {fournisseurs.join(', ')}. Un bon de commande s’adresse normalement à un seul
            fournisseur — pensez à le scinder avant de l’envoyer.
          </Message>
        </div>
      )}

      <Carte className="overflow-hidden zone-impression">
        {lignes.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-medium text-ardoise-800">Aucun produit dans ce bon de commande</p>
            <p className="mt-1 text-sm text-ardoise-400">
              Utilisez la barre de recherche ci-dessus pour en ajouter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ardoise-200 bg-ardoise-50 text-left text-xs uppercase tracking-wide text-ardoise-400">
                  <th className="w-10 px-3 py-2.5 font-medium">N°</th>
                  <th className="px-3 py-2.5 font-medium">Produit</th>
                  <th className="px-3 py-2.5 font-medium">Fournisseur</th>
                  <th className="w-36 px-3 py-2.5 text-right font-medium">Prix unitaire</th>
                  <th className="w-28 px-3 py-2.5 text-right font-medium">Quantité</th>
                  <th className="w-40 px-3 py-2.5 text-right font-medium">Sous-total</th>
                  <th className="w-12 px-3 py-2.5 sans-impression"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ardoise-100">
                {lignes.map((ligne, index) => (
                  <tr key={index} className="hover:bg-ardoise-50/60">
                    <td className="px-3 py-2 text-ardoise-400">{index + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-ardoise-900">{ligne.nomProduit}</div>
                      <div className="flex items-center gap-2">
                        {ligne.reference && (
                          <span className="text-xs text-ardoise-400">{ligne.reference}</span>
                        )}
                        {ligne.prixCatalogueCentimes !== null &&
                          ligne.prixCatalogueCentimes !== ligne.prixUnitaireCentimes && (
                            <Badge ton="alerte">
                              prix modifié · catalogue {formaterAriary(ligne.prixCatalogueCentimes)}
                            </Badge>
                          )}
                      </div>
                    </td>
                    <td
                      className={`px-3 py-2 ${
                        melange ? 'font-medium text-amber-700' : 'text-ardoise-600'
                      }`}
                    >
                      {ligne.fournisseur ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={fige}
                        value={(ligne.prixUnitaireCentimes / 100).toFixed(2)}
                        onChange={(evenement) =>
                          modifierLigne(index, {
                            prixUnitaireCentimes: Math.round(
                              Number(evenement.target.value || 0) * 100,
                            ),
                          })
                        }
                        className={`${classesChamp} chiffres !py-1.5 text-right`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0.001}
                        step="any"
                        disabled={fige}
                        value={ligne.quantiteMilliemes / MILLIEMES_PAR_UNITE}
                        onChange={(evenement) =>
                          modifierLigne(index, {
                            quantiteMilliemes: quantiteEnMilliemes(Number(evenement.target.value || 0)),
                          })
                        }
                        className={`${classesChamp} chiffres !py-1.5 text-right`}
                      />
                    </td>
                    <td className="chiffres px-3 py-2 text-right font-semibold">
                      {formaterAriary(sousTotaux[index] ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right sans-impression">
                      {!fige && (
                        <button
                          onClick={() => supprimerLigne(index)}
                          aria-label={`Supprimer ${ligne.nomProduit}`}
                          className="rounded p-1 text-ardoise-400 hover:bg-red-50 hover:text-red-600"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      {/* Le total reste visible en permanence : c'est le chiffre pour lequel
          l'utilisateur ouvre l'application. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ardoise-200 bg-white/95 backdrop-blur sans-impression">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-ardoise-400">Total général</div>
            <div className="chiffres text-3xl font-bold text-ardoise-900">{formaterAriary(total)}</div>
            <div className="text-xs text-ardoise-400">
              {lignes.length} ligne{lignes.length > 1 ? 's' : ''} · {quantiteTotale} article
              {quantiteTotale > 1 ? 's' : ''}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Bouton variante="secondaire" onClick={() => window.print()}>
              Imprimer
            </Bouton>
            {!fige && (
              <>
                <Bouton variante="secondaire" disabled={occupe} onClick={() => enregistrer('brouillon')}>
                  Enregistrer le brouillon
                </Bouton>
                <Bouton variante="principal" disabled={occupe} onClick={() => enregistrer('finalise')}>
                  Finaliser
                </Bouton>
              </>
            )}
            {fige && (
              <Bouton
                variante="danger"
                onClick={async () => {
                  if (!enregistre) return;
                  const document = await api.changerStatut(enregistre.id, 'annule');
                  setEnregistre(document);
                }}
              >
                Annuler le document
              </Bouton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
