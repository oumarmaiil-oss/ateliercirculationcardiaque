import React, { useEffect, useRef, useState } from 'react';
import { MessageCircleWarning, X } from 'lucide-react';

/** Nom d'utilisateur WhatsApp public : le numéro de téléphone n'est jamais affiché. */
export const WHATSAPP_USER = 'drSOWOUMAR';

export function whatsappLink(text?: string): string {
  return `https://wa.me/${WHATSAPP_USER}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  /** Contexte technique joint automatiquement (scène, constantes, lien). */
  context: string;
}

export const ReportModal: React.FC<ReportModalProps> = ({ open, onClose, context }) => {
  const [desc, setDesc] = useState('');
  const [copied, setCopied] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setCopied(false);
      window.setTimeout(() => areaRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const message = `Bonjour Dr Oumar Sow, j’ai repéré une erreur dans L’Atelier du Cœur :\n\n${
    desc.trim() || '(décrire ici ce qui ne va pas)'
  }\n\n— Contexte —\n${context}`;

  const send = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      /* le texte est aussi passé dans le lien WhatsApp */
    }
    window.open(whatsappLink(message), '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--line2)] bg-[#0b1120] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircleWarning className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            <h2 id="report-title" className="text-[16px] font-semibold text-[var(--txt)]">
              Signaler une erreur
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded border border-[var(--line)] bg-[var(--card)] p-1 text-[var(--muted)] hover:text-[var(--txt)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-[13px] leading-snug text-[var(--muted)]">
          Une valeur fausse, un texte inexact, un bouton qui ne marche pas ? Décrivez-le en une phrase :
          le message part sur WhatsApp vers <span className="font-semibold text-emerald-200">@{WHATSAPP_USER}</span>,
          avec la scène et les constantes jointes automatiquement.
        </p>

        <label className="mt-3 block text-[12px] font-semibold text-[var(--txt)]" htmlFor="report-desc">
          Ce qui ne va pas
        </label>
        <textarea
          id="report-desc"
          ref={areaRef}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          placeholder="Ex. : dans le cas « Fibrillation auriculaire », la fréquence cible me paraît…"
          className="mt-1 w-full resize-y rounded-lg border border-[var(--line2)] bg-[var(--bg)] p-2.5 text-[14px] text-[var(--txt)] outline-none focus:border-emerald-400/70"
        />

        <details className="mt-2 text-[12px] text-[var(--muted)]">
          <summary className="cursor-pointer select-none">Voir le contexte joint</summary>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--bg)] p-2 text-[11.5px] leading-snug">
            {context}
          </pre>
        </details>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {copied && (
            <span className="mr-auto text-[12px] text-emerald-300">
              Message copié : collez-le si WhatsApp ne l’affiche pas.
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold text-[var(--muted)] hover:text-[var(--txt)]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={send}
            className="rounded-lg bg-emerald-500 px-3.5 py-2 text-[13px] font-bold text-slate-950 hover:bg-emerald-400"
          >
            Envoyer sur WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
};
