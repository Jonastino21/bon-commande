import type { ReactNode } from 'react';

/** Petits composants partages par les ecrans. */

export function Badge({
  children,
  ton = 'neutre',
}: {
  children: ReactNode;
  ton?: 'neutre' | 'alerte' | 'succes' | 'info' | 'archive';
}) {
  const tons = {
    neutre: 'bg-ardoise-100 text-ardoise-600 ring-ardoise-200',
    alerte: 'bg-amber-50 text-amber-800 ring-amber-200',
    succes: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    info: 'bg-accent-50 text-accent-700 ring-accent-100',
    archive: 'bg-ardoise-100 text-ardoise-400 ring-ardoise-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${tons[ton]}`}
    >
      {children}
    </span>
  );
}

export function Bouton({
  children,
  variante = 'secondaire',
  ...reste
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'principal' | 'secondaire' | 'discret' | 'danger';
}) {
  const variantes = {
    principal: 'bg-accent-600 text-white hover:bg-accent-700 shadow-sm',
    secondaire: 'bg-white text-ardoise-800 ring-1 ring-ardoise-200 hover:bg-ardoise-50',
    discret: 'text-ardoise-600 hover:bg-ardoise-100',
    danger: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50',
  };
  return (
    <button
      {...reste}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
        transition disabled:cursor-not-allowed disabled:opacity-50
        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2
        ${variantes[variante]} ${reste.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function Carte({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-white ring-1 ring-ardoise-200/70 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Etiquette({ children }: { children: ReactNode }) {
  return <label className="block text-sm font-medium text-ardoise-600 mb-1.5">{children}</label>;
}

/**
 * Un champ desactive doit se voir comme tel : sur un document finalise, tous
 * les champs sont verrouilles, et s'ils gardent l'apparence d'un champ
 * ordinaire l'utilisateur essaie de taper dedans et croit a une panne.
 */
export const classesChamp =
  'w-full rounded-lg border-0 bg-white px-3 py-2 text-ardoise-900 ring-1 ring-inset ring-ardoise-200 ' +
  'placeholder:text-ardoise-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500 ' +
  'disabled:bg-ardoise-100 disabled:text-ardoise-600 disabled:ring-ardoise-100 disabled:cursor-not-allowed';

export function Message({
  ton,
  children,
  onFermer,
}: {
  ton: 'erreur' | 'succes' | 'info' | 'alerte';
  children: ReactNode;
  onFermer?: () => void;
}) {
  const tons = {
    erreur: 'bg-red-50 text-red-800 ring-red-200',
    succes: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    info: 'bg-accent-50 text-accent-700 ring-accent-100',
    alerte: 'bg-amber-50 text-amber-800 ring-amber-200',
  };
  return (
    <div
      role={ton === 'erreur' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${tons[ton]}`}
    >
      <span>{children}</span>
      {onFermer && (
        <button onClick={onFermer} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Fermer">
          ✕
        </button>
      )}
    </div>
  );
}

export function EtatVide({ titre, detail }: { titre: string; detail?: string }) {
  return (
    <div className="py-14 text-center">
      <p className="text-ardoise-800 font-medium">{titre}</p>
      {detail && <p className="mt-1 text-sm text-ardoise-400">{detail}</p>}
    </div>
  );
}
