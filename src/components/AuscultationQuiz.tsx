import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Headphones, Stethoscope, X, XCircle } from 'lucide-react';
import { FOYERS, type FoyerId } from '../audio/heartSounds';
import type { PresetConfig } from '../engine/types';

export interface QuizItem {
  id: string;
  label: string;
  preset: PresetConfig;
  /** Foyer où le signe s'entend le mieux (indice). */
  foyer: FoyerId;
  explication: string;
}

/**
 * Banque de sons : les réglages sont ceux des exemples de l'atelier, et la
 * sémiologie attendue de chacun est vérifiée par les tests unitaires
 * (src/audio/heartSounds.test.ts).
 */
export const QUIZ_BANK: QuizItem[] = [
  {
    id: 'normal',
    label: 'Cœur normal',
    preset: {},
    foyer: 'tous',
    explication:
      'Deux bruits seulement : B1 (fermeture mitrale et tricuspide), puis B2 (fermeture aortique puis pulmonaire). Silence entre les deux.',
  },
  {
    id: 'ra',
    label: 'Rétrécissement aortique',
    preset: { mal: ['ra'], hvg: 0.7 },
    foyer: 'aortique',
    explication:
      'Souffle systolique éjectionnel, rude, en losange, maximal au foyer aortique. B2 affaibli quand le rétrécissement est serré ; B4 fréquent (VG hypertrophié).',
  },
  {
    id: 'im',
    label: 'Insuffisance mitrale',
    preset: { mal: ['im'] },
    foyer: 'mitral',
    explication:
      'Souffle holosystolique en plateau, de B1 jusqu’à B2, maximal à l’apex (foyer mitral). B3 quand la fuite est importante.',
  },
  {
    id: 'ia',
    label: 'Insuffisance aortique',
    preset: { act: { aortique: 'fuite' } },
    foyer: 'erb',
    explication:
      'Souffle diastolique doux, aspiratif et décroissant, juste après B2, maximal au foyer d’Erb (3e espace intercostal gauche).',
  },
  {
    id: 'rm',
    label: 'Rétrécissement mitral',
    preset: { act: { mitrale: 'stenose' } },
    foyer: 'mitral',
    explication:
      'Roulement diastolique grave à l’apex, avec renforcement présystolique en rythme sinusal ; B1 claqué. Pas de B3 : l’obstacle empêche le remplissage rapide.',
  },
  {
    id: 'b3',
    label: 'B3 (galop protodiastolique)',
    preset: { mal: ['ic'] },
    foyer: 'mitral',
    explication:
      'Bruit sourd et grave juste après B2 (rythme « Ken-tu-cky »), à l’apex : remplissage rapide d’un ventricule gauche dilaté et défaillant.',
  },
  {
    id: 'b4',
    label: 'B4 (galop télédiastolique)',
    preset: { mal: ['hta'], hvg: 0.9 },
    foyer: 'mitral',
    explication:
      'Bruit sourd juste avant B1 (rythme « Ten-nes-see ») : l’oreillette pousse contre un ventricule épaissi et rigide (HTA ancienne). Il disparaît en FA.',
  },
  {
    id: 'fa',
    label: 'Fibrillation auriculaire',
    preset: { mal: ['fa'] },
    foyer: 'tous',
    explication:
      'Rythme irrégulièrement irrégulier, B1 d’intensité variable d’un battement à l’autre, jamais de B4.',
  },
];

const N_QUESTIONS = 6;

function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Charge le son de la question dans le simulateur. */
  onLoad: (preset: PresetConfig) => void;
  foyer: FoyerId;
  onFoyer: (f: FoyerId) => void;
  soundEnabled: boolean;
  onEnableSound: () => void;
}

export const AuscultationQuiz: React.FC<Props> = ({
  open,
  onClose,
  onLoad,
  foyer,
  onFoyer,
  soundEnabled,
  onEnableSound,
}) => {
  const [order, setOrder] = useState<QuizItem[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [hint, setHint] = useState(false);

  const restart = () => {
    const o = shuffle(QUIZ_BANK).slice(0, N_QUESTIONS);
    setOrder(o);
    setI(0);
    setPicked(null);
    setScore(0);
    setHint(false);
    onLoad(o[0].preset);
  };

  useEffect(() => {
    if (open) restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choices = useMemo(() => QUIZ_BANK.map((q) => ({ id: q.id, label: q.label })), []);

  if (!open || order.length === 0) return null;
  const done = i >= order.length;
  const q = order[Math.min(i, order.length - 1)];

  const answer = (id: string) => {
    if (picked) return;
    setPicked(id);
    if (id === q.id) setScore((s) => s + 1);
  };

  const next = () => {
    const n = i + 1;
    setI(n);
    setPicked(null);
    setHint(false);
    if (n < order.length) onLoad(order[n].preset);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/85 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="quiz-title">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-emerald-400/40 bg-[#0b1120] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            <h2 id="quiz-title" className="text-[16px] font-semibold text-[var(--txt)]">
              Quiz d’auscultation
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Quitter le quiz"
            className="rounded border border-[var(--line)] bg-[var(--card)] p-1 text-[var(--muted)] hover:text-[var(--txt)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="mt-4 text-center">
            <div className="mono text-[34px] font-bold text-emerald-300">
              {score}/{order.length}
            </div>
            <p className="mt-1 text-[14px] text-[var(--muted)]">
              {score === order.length
                ? 'Sans faute : oreille de cardiologue !'
                : score >= order.length / 2
                  ? 'Bonne oreille. Refaites un tour pour consolider.'
                  : 'Réécoutez en ralenti (×0,5) et en changeant de foyer : ça vient vite.'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold text-[var(--muted)] hover:text-[var(--txt)]">
                Retour à l’atelier
              </button>
              <button type="button" onClick={restart} className="rounded-lg bg-emerald-500 px-3.5 py-2 text-[13px] font-bold text-slate-950 hover:bg-emerald-400">
                Nouveau quiz
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-2 flex items-center justify-between text-[12px] text-[var(--muted)]">
              <span>
                Question {i + 1}/{order.length}
              </span>
              <span className="mono">Score : {score}</span>
            </div>

            {!soundEnabled ? (
              <button
                type="button"
                onClick={onEnableSound}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/60 bg-amber-500/15 px-3 py-3 text-[14px] font-semibold text-amber-100"
              >
                <Headphones className="h-5 w-5" /> Activer le son pour écouter
              </button>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-[13px] text-[var(--txt)]">
                <Headphones className="h-4 w-4 text-emerald-300" />
                Écoutez (au casque de préférence) : qu’entendez-vous ?
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
              <label className="flex items-center gap-1.5 text-[var(--muted)]">
                Foyer :
                <select
                  value={foyer}
                  onChange={(e) => onFoyer(e.target.value as FoyerId)}
                  className="rounded-md border border-[var(--line2)] bg-[var(--bg)] px-2 py-1 text-[12px] text-[var(--txt)]"
                >
                  {FOYERS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              {!picked && (
                <button type="button" onClick={() => setHint(true)} className="text-sky-300 underline-offset-2 hover:underline">
                  Indice
                </button>
              )}
              {hint && !picked && (
                <span className="text-sky-200">
                  Écoutez plutôt : {FOYERS.find((f) => f.id === q.foyer)?.label.toLowerCase()}.
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {choices.map((c) => {
                const isRight = picked && c.id === q.id;
                const isWrong = picked === c.id && c.id !== q.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!!picked}
                    onClick={() => answer(c.id)}
                    className={`rounded-lg border px-2.5 py-2 text-left text-[13px] font-semibold transition ${
                      isRight
                        ? 'border-emerald-400 bg-emerald-500/25 text-emerald-50'
                        : isWrong
                          ? 'border-red-400 bg-red-500/20 text-red-100'
                          : 'border-[var(--line2)] bg-[var(--card)] text-[var(--txt)] enabled:hover:border-emerald-400/60 disabled:opacity-60'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            {picked && (
              <div className={`mt-3 rounded-xl border p-3 text-[13px] leading-snug ${picked === q.id ? 'border-emerald-400/50 bg-emerald-950/40' : 'border-red-400/50 bg-red-950/30'}`}>
                <div className="flex items-center gap-1.5 font-semibold">
                  {picked === q.id ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-300" />
                  )}
                  <span className="text-[var(--txt)]">
                    {picked === q.id ? 'Exact' : `C’était : ${q.label}`}
                  </span>
                </div>
                <p className="mt-1 text-[var(--muted)]">{q.explication}</p>
                <div className="mt-2.5 flex justify-end">
                  <button type="button" onClick={next} className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-[13px] font-bold text-slate-950 hover:bg-sky-300">
                    {i + 1 < order.length ? 'Question suivante' : 'Voir mon score'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
