import { actOf } from '../engine/physiology';
import { beat, valves, type CardiacClockState } from '../engine/clock';
import { clamp } from '../engine/geometry2d';
import type { ComputedResult, SimParams } from '../engine/types';
import { hiDPI } from './charts';

/**
 * « Valves vues d'en haut » : plan valvulaire (base du cœur, oreillettes retirées),
 * comme le voit le chirurgien. Disposition classique : pulmonaire en avant,
 * aortique au centre, mitrale en arrière à gauche, tricuspide à droite du patient
 * (donc à gauche de l'écran). Les orifices suivent en temps réel l'ouverture
 * calculée par le moteur, réduite en cas de rétrécissement ; une fuite laisse
 * un orifice résiduel quand la valve devrait être fermée.
 */

const W = 300;
const H = 230;

type State = { open: number; sten: boolean; fuite: boolean };

function label(c: CanvasRenderingContext2D, x: number, y: number, name: string, st: State, closedPhase: boolean) {
  c.textAlign = 'center';
  c.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
  c.fillStyle = '#e2e8f0';
  c.fillText(name, x, y);
  const status = st.sten
    ? 'rétrécie'
    : st.fuite && closedPhase
      ? 'fuit'
      : st.open > 0.15
        ? 'ouverte'
        : 'fermée';
  c.font = '10px "Plus Jakarta Sans", system-ui, sans-serif';
  c.fillStyle = st.sten ? '#facc15' : st.fuite && closedPhase ? '#f472b6' : st.open > 0.15 ? '#6ee7b7' : '#94a3b8';
  c.fillText(status, x, y + 12);
}

/** Valve sigmoïde (aortique, pulmonaire) : 3 cuspides autour d'un orifice central. */
function semilunar(c: CanvasRenderingContext2D, x: number, y: number, R: number, st: State, closedPhase: boolean, pulse: number) {
  c.save();
  c.translate(x, y);
  // Anneau
  c.fillStyle = '#3f1d2b';
  c.beginPath();
  c.arc(0, 0, R + 6, 0, Math.PI * 2);
  c.fill();
  const maxOpen = st.sten ? 0.28 : 1;
  const o = clamp(st.open * maxOpen, 0, 1);
  // Orifice : triangle arrondi dont la taille suit l'ouverture
  const ro = R * 0.92 * o;
  const leak = st.fuite && closedPhase ? R * 0.22 * (0.85 + 0.15 * pulse) : 0;
  const hole = Math.max(ro, leak);
  // Cuspides
  c.fillStyle = st.sten ? '#facc15' : st.fuite ? '#fbcfe8' : '#fef3c7';
  c.strokeStyle = st.sten ? '#a16207' : '#78716c';
  c.lineWidth = st.sten ? 3 : 1.2;
  c.beginPath();
  c.arc(0, 0, R, 0, Math.PI * 2);
  c.fill();
  // Commissures
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    c.stroke();
  }
  if (hole > 0.5) {
    c.fillStyle = leak > ro ? '#be185d' : '#0b0f1c';
    c.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 6 + (k * 2 * Math.PI) / 3;
      const px = Math.cos(a) * hole;
      const py = Math.sin(a) * hole;
      if (k === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** Valve auriculo-ventriculaire : orifice en « bouche de poisson ». */
function atrioventricular(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  Rx: number,
  Ry: number,
  st: State,
  closedPhase: boolean,
  pulse: number,
  rot: number
) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.fillStyle = '#3f1d2b';
  c.beginPath();
  c.ellipse(0, 0, Rx + 6, Ry + 6, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = st.sten ? '#facc15' : st.fuite ? '#fbcfe8' : '#fef3c7';
  c.strokeStyle = st.sten ? '#a16207' : '#78716c';
  c.lineWidth = st.sten ? 3 : 1.2;
  c.beginPath();
  c.ellipse(0, 0, Rx, Ry, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  const maxOpen = st.sten ? 0.3 : 1;
  const o = clamp(st.open * maxOpen, 0, 1);
  const leak = st.fuite && closedPhase ? 0.16 * (0.85 + 0.15 * pulse) : 0;
  const k = Math.max(o, leak);
  // Ligne de coaptation (valve fermée) ou orifice ouvert
  c.strokeStyle = '#57534e';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(-Rx * 0.85, 0);
  c.quadraticCurveTo(0, Ry * 0.35, Rx * 0.85, 0);
  c.stroke();
  if (k > 0.02) {
    c.fillStyle = leak > o ? '#be185d' : '#0b0f1c';
    c.beginPath();
    c.ellipse(0, Ry * 0.08, Rx * 0.82 * Math.max(0.35, k), Ry * 0.8 * k, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

export function drawValvePlane(cv: HTMLCanvasElement, clk: CardiacClockState, p: SimParams, r: ComputedResult): void {
  const c = hiDPI(cv, W, H);
  if (!c) return;
  const t = clk.t;
  const b = beat(clk, r, t);
  const va = valves(clk, r, t, b);
  const pulse = 0.5 + 0.5 * Math.sin(t * 18);
  const systole = t >= b.sys && t < b.ivr;

  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(7,11,20,0.94)';
  c.strokeStyle = 'rgba(148,163,184,0.3)';
  c.lineWidth = 1;
  c.beginPath();
  c.roundRect(0.5, 0.5, W - 1, H - 1, 12);
  c.fill();
  c.stroke();

  c.textAlign = 'left';
  c.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
  c.fillStyle = '#7dd3fc';
  c.fillText('Valves vues d’en haut', 10, 17);
  c.font = '9.5px "Plus Jakarta Sans", system-ui, sans-serif';
  c.fillStyle = '#64748b';
  c.fillText('avant ↑', W - 46, 17);
  c.fillText(systole ? 'systole' : 'diastole', W - 46, 29);

  const ao: State = {
    open: va.aortique,
    sten: r.surfAo < 1.5 || actOf('aortique', p) === 'stenose',
    fuite: r.rfAo > 0,
  };
  const pu: State = { open: va.pulmonaire, sten: actOf('pulmonaire', p) === 'stenose', fuite: actOf('pulmonaire', p) === 'fuite' };
  const mi: State = { open: va.mitrale, sten: actOf('mitrale', p) === 'stenose', fuite: r.rf > 0 };
  const tr: State = { open: va.tricuspide, sten: actOf('tricuspide', p) === 'stenose', fuite: actOf('tricuspide', p) === 'fuite' };

  // Les sigmoïdes fuient en diastole, les auriculo-ventriculaires en systole.
  semilunar(c, 130, 62, 22, pu, !systole, pulse);
  semilunar(c, 158, 112, 24, ao, !systole, pulse);
  atrioventricular(c, 212, 160, 34, 22, mi, systole, pulse, -0.35);
  atrioventricular(c, 86, 158, 38, 25, tr, systole, pulse, 0.3);

  label(c, 70, 58, 'Pulmonaire', pu, !systole);
  label(c, 230, 104, 'Aortique', ao, !systole);
  label(c, 212, 196, 'Mitrale', mi, systole);
  label(c, 86, 196, 'Tricuspide', tr, systole);
}
