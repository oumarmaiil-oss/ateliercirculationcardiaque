import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';

export interface TourStep {
  /** Valeur de l'attribut data-tour de l'élément à mettre en évidence. */
  target: string;
  title: string;
  text: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: 'echelles',
    title: '1 · Trois échelles reliées',
    text: 'Corps entier, Cœur, Vaisseau : tout ce que vous changez à une échelle se répercute sur les autres.',
  },
  {
    target: 'scene',
    title: '2 · Touchez la scène',
    text: 'Cliquez sur une cavité, une valve ou une artère : sa fiche s’ouvre, avec des actions (affaiblir, rétrécir, faire fuir, réparer).',
  },
  {
    target: 'panneau',
    title: '3 · Exemples et réglages',
    text: 'Lancez un exemple prêt à l’emploi (maladie, traitement) ou combinez vous-même pathologies et médicaments.',
  },
  {
    target: 'transport',
    title: '4 · 3D, son et vitesse',
    text: 'Passez en 3D, activez le son et choisissez le foyer d’auscultation. Le ralenti ×0,25 laisse voir chaque valve.',
  },
  {
    target: 'modes',
    title: '5 · Pathologies à soigner',
    text: '7 cas cliniques : prescrivez, puis faites évaluer votre traitement. Juste à côté, le Quiz teste votre oreille.',
  },
];

function findTarget(name: string): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return els.find((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0) || null;
}

interface GuidedTourProps {
  open: boolean;
  onClose: () => void;
}

export const GuidedTour: React.FC<GuidedTourProps> = ({ open, onClose }) => {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  const measure = useCallback(() => {
    if (!open) return;
    const el = findTarget(TOUR_STEPS[i].target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [open, i]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = findTarget(TOUR_STEPS[i].target);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 40) {
        el.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    }
    measure();
  }, [open, i, measure]);

  useEffect(() => {
    if (!open) return;
    const on = () => measure();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((v) => Math.min(TOUR_STEPS.length - 1, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, measure, onClose]);

  if (!open) return null;
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(340, vw - 24);
  const pad = 6;

  // Bulle sous la cible s'il y a la place, sinon au-dessus, sinon centrée.
  let top = vh / 2 - 90;
  let left = (vw - cardW) / 2;
  if (rect) {
    left = Math.min(Math.max(12, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 12);
    if (rect.bottom + 190 < vh) top = rect.bottom + 12;
    else if (rect.top - 190 > 0) top = rect.top - 190;
  }

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-sky-400 transition-all duration-200"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(2,6,23,0.72)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/70" />
      )}
      <div
        className="absolute rounded-2xl border border-sky-400/50 bg-[#0b1120] p-4 shadow-2xl"
        style={{ top, left, width: cardW }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
          Visite guidée · {i + 1}/{TOUR_STEPS.length}
        </div>
        <h2 id="tour-title" className="mt-1 text-[15px] font-semibold text-[var(--txt)]">
          {step.title}
        </h2>
        <p className="mt-1.5 text-[13px] leading-snug text-[var(--muted)]">{step.text}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="mr-auto text-[12px] text-[var(--dim)] underline-offset-2 hover:text-[var(--txt)] hover:underline"
          >
            Passer
          </button>
          {i > 0 && (
            <button
              type="button"
              onClick={() => setI(i - 1)}
              className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--txt)]"
            >
              Retour
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? onClose() : setI(i + 1))}
            className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-bold text-slate-950 hover:bg-sky-300"
          >
            {last ? 'C’est parti' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  );
};
