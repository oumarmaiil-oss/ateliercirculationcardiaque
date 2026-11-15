import { C, DC_N } from '../engine/physiology';
import { ventContraction, type CardiacClockState } from '../engine/clock';
import {
  clamp,
  distPoly,
  fmt,
  lerp,
  path2D,
  polyAt,
  polyLen,
  type Point2D,
} from '../engine/geometry2d';
import type {
  ComputedResult,
  SceneLesionId,
  SimParams,
  VesselSiteId,
  ViewLevel,
  VisualStoryOverlay,
} from '../engine/types';
import { hiDPI } from './charts';

export interface CorpsRuntimeState {
  flow: number[];
  lastT: number;
  embolActive: boolean;
  embolProgress: number;
  embolArrived: boolean;
}

export function createCorpsState(): CorpsRuntimeState {
  return {
    flow: [],
    lastT: 0,
    embolActive: false,
    embolProgress: 0,
    embolArrived: false,
  };
}

/**
 * Circulation en boucles fermées : artère → lit capillaire → veine.
 * Le long de chaque boucle, la couleur des globules passe progressivement
 * du rouge (sang oxygéné) au bleu (sang désaturé) dans les capillaires des
 * organes, et du bleu au rouge dans les capillaires pulmonaires.
 * cap = [début, fin] du lit capillaire, en fraction de la longueur.
 */
interface FlowLoop {
  id: 'cerveau' | 'rein' | 'jambeG' | 'jambeD' | 'brasG' | 'brasD' | 'poumonG' | 'poumonD';
  pts: Point2D[];
  cap: [number, number];
  pulm: boolean;
  n: number;
}

const LOOPS: FlowLoop[] = [
  {
    id: 'cerveau',
    pts: [[380, 198], [380, 148], [368, 108], [358, 72], [354, 56], [366, 44], [380, 48], [372, 62], [364, 72], [374, 140], [374, 202]],
    cap: [0.36, 0.62],
    pulm: false,
    n: 9,
  },
  {
    id: 'rein',
    pts: [[380, 268], [380, 290], [410, 296], [420, 304], [416, 312], [404, 306], [378, 300], [374, 280]],
    cap: [0.38, 0.62],
    pulm: false,
    n: 4,
  },
  {
    id: 'jambeG',
    pts: [[380, 210], [380, 326], [341, 500], [336, 510], [346, 514], [347, 500], [374, 328], [374, 222]],
    cap: [0.44, 0.56],
    pulm: false,
    n: 14,
  },
  {
    id: 'jambeD',
    pts: [[380, 210], [380, 326], [419, 500], [424, 510], [414, 514], [413, 500], [374, 328], [374, 222]],
    cap: [0.45, 0.55],
    pulm: false,
    n: 14,
  },
  {
    id: 'brasG',
    pts: [[380, 200], [312, 186], [284, 298], [286, 306], [292, 300], [298, 252], [320, 204], [374, 206]],
    cap: [0.44, 0.58],
    pulm: false,
    n: 8,
  },
  {
    id: 'brasD',
    pts: [[380, 200], [448, 186], [476, 298], [474, 306], [468, 300], [462, 252], [440, 204], [374, 206]],
    cap: [0.44, 0.58],
    pulm: false,
    n: 8,
  },
  {
    // Artère pulmonaire (bleue) → capillaires alvéolaires → veine pulmonaire (rouge) vers l'OG.
    id: 'poumonG',
    pts: [[374, 202], [326, 196], [318, 214], [326, 232], [342, 222], [354, 210], [390, 206]],
    cap: [0.3, 0.62],
    pulm: true,
    n: 6,
  },
  {
    id: 'poumonD',
    pts: [[374, 202], [434, 196], [442, 214], [434, 232], [418, 222], [406, 210], [390, 206]],
    cap: [0.3, 0.62],
    pulm: true,
    n: 6,
  },
];

const LOOP_LEN: number[] = [];

/** Rouge artériel, assombri vers le violet quand la saturation baisse. */
function arterialRgb(sat: number): [number, number, number] {
  const k = clamp((97 - sat) / 25, 0, 1);
  return [Math.round(lerp(248, 150, k)), Math.round(lerp(113, 90, k)), Math.round(lerp(113, 200, k))];
}
const VENOUS: [number, number, number] = [96, 165, 250];

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): string {
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}

function smooth01(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

const EMBOL_PATH: Point2D[] = [
  [392, 202],
  [380, 178],
  [380, 148],
  [368, 108],
  [355, 62],
];

const CORONARY_EMBOL_PATH: Point2D[] = [
  [380, 180],
  [382, 195],
  [388, 210],
  [394, 216],
];

const LEG_EMBOL_PATH: Point2D[] = [
  [380, 210],
  [380, 326],
  [412, 405],
  [416, 415],
];

function drawLoop(
  c: CanvasRenderingContext2D,
  arr: number[],
  idx: number,
  loop: FlowLoop,
  n: number,
  dt: number,
  speedPx: number,
  art: [number, number, number],
  rad: number
): void {
  if (LOOP_LEN[idx] === undefined) LOOP_LEN[idx] = polyLen(loop.pts);
  const L = LOOP_LEN[idx];
  if (L < 1) return;
  if (arr[idx] === undefined) arr[idx] = 0;
  arr[idx] = (((arr[idx] + dt * speedPx) % L) + L) % L;
  const [c0, c1] = loop.cap;
  for (let i = 0; i < n; i++) {
    const d = (arr[idx] + (L * i) / n) % L;
    const u = d / L;
    // 0 = couleur d'entrée, 1 = couleur de sortie (désaturation ou réoxygénation).
    const k = smooth01((u - c0) / (c1 - c0));
    const t = loop.pulm ? 1 - k : k;
    const pt = polyAt(loop.pts, d);
    c.fillStyle = mixRgb(art, VENOUS, t);
    c.beginPath();
    c.arc(pt[0], pt[1], rad, 0, Math.PI * 2);
    c.fill();
  }
}

/** Lit capillaire : fin réseau dont la couleur passe d'un bout à l'autre. */
function drawCapBed(c: CanvasRenderingContext2D, loop: FlowLoop, art: [number, number, number]): void {
  const L = polyLen(loop.pts);
  const a = polyAt(loop.pts, L * loop.cap[0]);
  const b = polyAt(loop.pts, L * loop.cap[1]);
  const g = c.createLinearGradient(a[0], a[1], b[0], b[1]);
  const from = loop.pulm ? `rgb(${VENOUS.join(',')})` : `rgb(${art.join(',')})`;
  const to = loop.pulm ? `rgb(${art.join(',')})` : `rgb(${VENOUS.join(',')})`;
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  c.save();
  c.strokeStyle = g;
  c.globalAlpha = 0.55;
  c.lineWidth = 1.4;
  c.lineCap = 'round';
  c.beginPath();
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const u = loop.cap[0] + ((loop.cap[1] - loop.cap[0]) * i) / steps;
    const pt = polyAt(loop.pts, L * u);
    if (i === 0) c.moveTo(pt[0], pt[1]);
    else c.lineTo(pt[0], pt[1]);
  }
  c.stroke();
  c.restore();
}

export function corpsLesionHit(
  x: number,
  y: number,
  p: SimParams,
  r: ComputedResult,
  story?: VisualStoryOverlay
): SceneLesionId | null {
  if (p.mal.avc && (Math.hypot(x - 363, y - 86) < 20 || Math.hypot(x - 356, y - 58) < 20)) {
    return 'avc-clot';
  }
  if (r.pulmEmb && Math.hypot(x - 412, y - 198) < 20) {
    return 'pulm-emb';
  }
  if (p.ischJambe && Math.hypot(x - 416, y - 415) < 20) {
    return 'leg-clot';
  }
  const faVisible = p.mal.fa && !p.mal.avc && (!r.tr.anticoagulant || (story?.clotProgress ?? 0.5) > 0.14);
  if (faVisible && Math.hypot(x - 394, y - 202) < 16) {
    return 'fa-clot';
  }
  if (r.zoneIDM && Math.hypot(x - 386, y - 212) < 15) {
    return `coro-${r.zoneIDM}` as SceneLesionId;
  }
  return null;
}

export function corpsHit(x: number, y: number): { kind: 'heart' } | { kind: 'site'; site: VesselSiteId } | null {
  if (Math.hypot(x - 384, y - 208) < 34) return { kind: 'heart' };
  if (distPoly([x, y], [[380, 185], [380, 325]]) < 14) return { kind: 'site', site: 'aorte' };
  if (distPoly([x, y], [[380, 152], [362, 85]]) < 14) return { kind: 'site', site: 'carotide' };
  if (
    distPoly([x, y], [[350, 380], [340, 505]]) < 16 ||
    distPoly([x, y], [[410, 380], [420, 505]]) < 16
  ) {
    return { kind: 'site', site: 'jambe' };
  }
  return null;
}

export interface DrawCorpsArgs {
  cv: HTMLCanvasElement;
  clk: CardiacClockState;
  p: SimParams;
  r: ComputedResult;
  state: CorpsRuntimeState;
  level: ViewLevel;
  showLabels: boolean;
  isLightParticles: boolean;
  onEmbolArrived?: () => void;
  story?: VisualStoryOverlay;
}

export function drawCorps({
  cv,
  clk,
  p,
  r,
  state,
  level,
  showLabels,
  isLightParticles,
  onEmbolArrived,
  story,
}: DrawCorpsArgs): void {
  const W = 760;
  const H = 560;
  const c = hiDPI(cv, W, H);
  if (!c) return;

  const dt = clamp(clk.t - state.lastT, -0.1, 0.1);
  state.lastT = clk.t;

  c.clearRect(0, 0, W, H);

  // Silhouette
  c.save();
  c.fillStyle = 'rgba(203,213,225,0.05)';
  c.strokeStyle = 'rgba(203,213,225,0.18)';
  c.lineWidth = 1.6;
  c.beginPath();
  c.arc(380, 62, 34, 0, Math.PI * 2);
  c.fill();
  c.stroke();

  path2D(
    c,
    [
      [362, 95],
      [398, 95],
      [402, 118],
      [462, 134],
      [482, 170],
      [494, 305],
      [470, 308],
      [454, 190],
      [444, 326],
      [434, 515],
      [404, 515],
      [396, 355],
      [380, 350],
      [364, 355],
      [356, 515],
      [326, 515],
      [316, 326],
      [306, 190],
      [290, 308],
      [266, 305],
      [278, 170],
      [298, 134],
      [358, 118],
    ],
    true
  );
  c.fill();
  c.stroke();
  c.restore();

  // Brain & AVC zone
  c.save();
  c.fillStyle = p.mal.avc ? 'rgba(248,113,113,0.18)' : 'rgba(244,114,182,0.12)';
  c.strokeStyle = 'rgba(244,114,182,0.34)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.ellipse(380, 56, 24, 19, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  if (p.mal.avc) {
    c.fillStyle = '#ef4444';
    c.beginPath();
    c.arc(356, 58, 8, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#fecaca';
    c.lineWidth = 1.2;
    c.stroke();
  }
  c.restore();

  // Lungs + Congestion / OAP
  const cong = clamp(r.congestion, 0, 1.5);
  [-1, 1].forEach((side) => {
    const cx = 380 + side * 46;
    const cy = 198;
    c.save();
    c.fillStyle = `rgba(${Math.round(lerp(96, 239, Math.min(1, cong)))},${Math.round(
      lerp(165, 110, Math.min(1, cong))
    )},250,${0.13 + 0.24 * Math.min(1, cong)})`;
    c.strokeStyle =
      cong > 0.3 ? 'rgba(251,191,36,0.58)' : 'rgba(147,197,253,0.3)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(cx, cy, 30, 50, side * -0.1, 0, Math.PI * 2);
    c.fill();
    c.stroke();

    if (r.pog >= C.moteur.seuilOAP) {
      c.fillStyle = 'rgba(125,211,252,0.72)';
      for (let k = 0; k < 7; k++) {
        c.beginPath();
        c.arc(
          cx - 10 + (k % 3) * 10,
          cy + 14 + Math.floor(k / 3) * 12,
          3.2,
          0,
          Math.PI * 2
        );
        c.fill();
      }
    }
    c.restore();
  });

  // Kidneys
  [-1, 1].forEach((side) => {
    const cx = 380 + side * 34;
    const cy = 298;
    c.save();
    c.fillStyle =
      r.rein > 0.25 ? 'rgba(251,146,60,0.44)' : 'rgba(190,100,100,0.28)';
    c.strokeStyle =
      r.rein > 0.25 ? '#fb923c' : 'rgba(248,113,113,0.42)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(cx, cy, 10, 16, side * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
  });

  // Vascular tree (reflects vasoconstriction vs vasodilators like Amloperin/Tensoplus)
  const vasodil = r.tr.ica || r.raa > 0;
  const artMul = clamp(1 / Math.sqrt(r.resist), 0.78, 1.32);
  const strokePath = (pts: Point2D[], col: string, w: number) => {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    path2D(c, pts);
    c.stroke();
  };

  strokePath([[374, 190], [374, 70]], '#3b82f6', 3.5);
  strokePath([[374, 210], [374, 326], [346, 505]], '#3b82f6', 4.5 + (r.pvc > 8 ? 1.5 : 0));
  strokePath([[374, 326], [414, 505]], '#3b82f6', 4.5 + (r.pvc > 8 ? 1.5 : 0));
  strokePath([[374, 200], [326, 196], [318, 214]], '#3b82f6', 3.5);
  strokePath([[374, 200], [434, 196], [442, 214]], '#3b82f6', 3.5);
  // Retours veineux des bras et du rein.
  strokePath([[292, 300], [298, 252], [320, 204], [374, 206]], 'rgba(59,130,246,0.75)', 2.6);
  strokePath([[468, 300], [462, 252], [440, 204], [374, 206]], 'rgba(59,130,246,0.75)', 2.6);
  strokePath([[404, 306], [378, 300]], 'rgba(59,130,246,0.75)', 2.4);
  // Veines pulmonaires : sang ré-oxygéné vers l'oreillette gauche.
  {
    const pv = arterialRgb(r.satArt);
    const pvCol = `rgba(${pv[0]},${pv[1]},${pv[2]},0.85)`;
    strokePath([[326, 232], [342, 222], [354, 210], [390, 206]], pvCol, 3);
    strokePath([[434, 232], [418, 222], [406, 210], [390, 206]], pvCol, 3);
  }

  if (vasodil) {
    // Subtle emerald vasodilation halo around main arteries when vasodilators act
    c.save();
    c.globalAlpha = 0.25;
    strokePath([[380, 196], [380, 148], [368, 108], [358, 70]], '#34d399', 4 * artMul + 4);
    strokePath([[380, 198], [380, 326], [340, 505]], '#34d399', 5.5 * artMul + 4);
    strokePath([[380, 326], [420, 505]], '#34d399', 5 * artMul + 4);
    c.restore();
  }

  const artCol = r.resist > 1.18 ? '#fb923c' : '#ef4444';
  strokePath([[380, 196], [380, 148], [368, 108], [358, 70]], artCol, 4 * artMul);
  strokePath([[380, 198], [380, 326], [340, 505]], artCol, 5.5 * artMul);
  strokePath([[380, 326], [420, 505]], artCol, 5 * artMul);
  strokePath([[380, 198], [312, 186], [284, 300]], artCol, 3.5 * artMul);
  strokePath([[380, 198], [448, 186], [476, 300]], artCol, 3.5 * artMul);
  strokePath([[380, 290], [414, 298]], artCol, 2.8 * artMul);

  const drawClotMarker = (cx: number, cy: number, rad: number) => {
    c.save();
    c.fillStyle = '#991b1b';
    c.strokeStyle = '#fbbf24';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, rad, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
  };

  if (p.mal.avc) drawClotMarker(363, 86, 6);
  if (r.pulmEmb) drawClotMarker(412, 198, 7);
  if (p.ischJambe) drawClotMarker(416, 415, 6);
  if (r.zoneIDM) drawClotMarker(386, 212, 5.5);

  // Ankle edema (clearly proportional so Amloperin/Tensoplus −38 % reduction is visible!)
  if (r.oedeme > 0.08) {
    const oed = clamp(r.oedeme, 0, 1);
    c.fillStyle = `rgba(125,211,252,${0.18 + 0.48 * oed})`;
    c.strokeStyle = `rgba(56,189,248,${0.3 + 0.4 * oed})`;
    c.lineWidth = 1.2;
    [340, 420].forEach((x) => {
      c.beginPath();
      c.ellipse(x, 508, 10 + 13 * oed, 6 + 7 * oed, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    });
  }

  // Sang en circulation : boucles fermées avec changement de couleur dans les capillaires.
  const spd = 72 * clamp(r.dc / DC_N, 0.25, 2.5);
  const art = arterialRgb(r.satArt);
  LOOPS.forEach((loop) => drawCapBed(c, loop, art));
  LOOPS.forEach((loop, i) => {
    // Mode léger : moitié moins de globules, mais toutes les boucles restent animées.
    const n = isLightParticles ? Math.max(3, Math.round(loop.n / 2)) : loop.n;
    const blocked =
      (p.mal.avc && loop.id === 'cerveau') ||
      (r.pulmEmb && loop.pulm) ||
      (p.ischJambe && loop.id === 'jambeD');
    drawLoop(c, state.flow, i, loop, n, dt, blocked ? 0 : spd, art, 2.6);
  });

  // Beating heart icon in thorax (dilated & weaker beat if LV/RV weak, amber ring if stenotic)
  const vc = ventContraction(clk, r, clk.t);
  const heartWeak = p.mal.ic || r.acts.vg === 'faible' || r.acts.vd === 'faible';
  const heartSten = r.surfAo < 1.5 || r.acts.mitrale === 'stenose' || r.acts.tricuspide === 'stenose';
  const sc = (heartWeak ? 1.14 : 1) * (1 - (heartWeak ? 0.05 : 0.12) * vc);
  c.save();
  c.translate(384, 208);
  c.scale(sc, sc);
  c.fillStyle = heartWeak ? '#9f1239' : '#e11d48';
  c.strokeStyle = heartSten ? '#fbbf24' : '#fda4af';
  c.lineWidth = heartSten ? 2.4 : 1.6;
  c.beginPath();
  c.moveTo(0, 18);
  c.bezierCurveTo(-24, 2, -22, -20, -6, -18);
  c.bezierCurveTo(0, -17, 2, -10, 2, -10);
  c.bezierCurveTo(2, -10, 8, -19, 16, -15);
  c.bezierCurveTo(26, -10, 20, 10, 0, 18);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();

  // FA clot in LA appendage (hidden completely when anticoagulated & healed)
  const faClotStrength = story ? story.clotProgress * (1 - story.treatmentHeal * 0.85) : r.tr.anticoagulant ? 0 : 0.8;
  if (p.mal.fa && !state.embolActive && !p.mal.avc && (!r.tr.anticoagulant || faClotStrength > 0.14)) {
    drawClotMarker(394, 202, r.tr.anticoagulant ? 3.5 : 5.5);
  }

  // Clot-to-brain embolus animation
  if (state.embolActive) {
    const L = polyLen(EMBOL_PATH);
    state.embolProgress = clamp(state.embolProgress + Math.max(0, dt) * 0.45, 0, 1);
    const pt = polyAt(EMBOL_PATH, L * state.embolProgress);
    c.fillStyle = '#fbbf24';
    c.strokeStyle = '#fef3c7';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(pt[0], pt[1], 6, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    if (state.embolProgress >= 1 && !state.embolArrived) {
      state.embolArrived = true;
      state.embolActive = false;
      onEmbolArrived?.();
    }
  }

  // Storyboard detaching embolus travel (cycles cleanly while active on key moment)
  if (!state.embolActive && story?.embolDetached) {
    const route =
      p.site === 'carotide' || p.mal.fa
        ? EMBOL_PATH
        : p.site === 'jambe'
          ? LEG_EMBOL_PATH
          : CORONARY_EMBOL_PATH;
    const L = polyLen(route);
    const u = (clk.t * 0.45) % 1;
    const pt = polyAt(route, L * u);
    c.save();
    c.fillStyle = '#dc2626';
    c.strokeStyle = '#fbbf24';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(pt[0], pt[1], 6, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
  }

  // Labels & callouts
  if (showLabels) {
    const lbl = (
      x: number,
      y: number,
      txt: string,
      col = '#cbd5e1',
      align: CanvasTextAlign = 'left'
    ) => {
      c.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
      c.textAlign = align;
      c.fillStyle = col;
      c.fillText(txt, x, y);
    };

    lbl(
      430,
      58,
      p.mal.avc ? 'Cerveau · AVC ischémique' : 'Cerveau',
      p.mal.avc ? '#f87171' : '#e2e8f0'
    );
    lbl(
      475,
      188,
      r.pog >= C.moteur.seuilOAP
        ? 'Poumons · Œdème pulmonaire'
        : r.congestion > 0.25
          ? 'Poumons · Congestion'
          : 'Poumons',
      r.congestion > 0.25 ? '#fbbf24' : '#e2e8f0'
    );
    lbl(285, 208, 'Cœur (cliquer)', '#fda4af', 'right');
    lbl(
      442,
      302,
      r.rein > 0.25 ? 'Reins · souffrance' : 'Reins',
      r.rein > 0.25 ? '#fb923c' : '#e2e8f0'
    );
    lbl(
      325,
      362,
      'Aorte (cliquer)',
      level === 1 ? '#94a3b8' : '#cbd5e1',
      'right'
    );
    lbl(348, 108, 'Carotide', '#94a3b8', 'right');
    lbl(
      445,
      504,
      r.oedeme > 0.15
        ? 'Chevilles · œdème'
        : p.ischJambe
          ? 'Jambe · ischémie'
          : 'Artère fémorale',
      r.oedeme > 0.15 ? '#7dd3fc' : p.ischJambe ? '#f87171' : '#94a3b8'
    );
    if (r.pulmEmb) lbl(475, 208, 'Embolie pulmonaire', '#fbbf24');
    if (r.satArt < 94) {
      lbl(
        475,
        226,
        `Oxygène dans le sang : ${fmt(r.satArt)} %`,
        '#f87171'
      );
    }
  }

  // Inspection focus spotlight ring when paused on a key moment
  if (story?.inspectionPaused && story.focusZone) {
    if (story.focusZone === 'hta-organes') {
      const targets = [
        { x: 380, y: 56, r: 34, tag: 'Cerveau' },
        { x: 384, y: 208, r: 34, tag: 'Cœur (HVG)' },
        { x: 380, y: 298, r: 50, tag: 'Reins' },
      ];
      c.save();
      c.strokeStyle = '#38bdf8';
      c.lineWidth = 1.8;
      c.setLineDash([5, 4]);
      for (const tg of targets) {
        c.beginPath();
        c.arc(tg.x, tg.y, tg.r, 0, Math.PI * 2);
        c.stroke();
      }
      c.setLineDash([]);
      c.fillStyle = 'rgba(15, 23, 42, 0.9)';
      c.beginPath();
      c.roundRect(245, 10, 270, 22, 6);
      c.fill();
      c.strokeStyle = 'rgba(56,189,248,0.65)';
      c.lineWidth = 1;
      c.stroke();
      c.fillStyle = '#bae6fd';
      c.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(story.focusLabel, 380, 25);
      c.restore();
    } else {
      const spotMap: Record<string, { x: number; y: number; r: number } | undefined> = {
        cerveau: { x: 372, y: 58, r: 42 },
        poumons: { x: 424, y: 198, r: 54 },
        coronaire: { x: 386, y: 210, r: 42 },
        rein: { x: 380, y: 298, r: 56 },
        embole: { x: 368, y: 120, r: 44 },
        cheville: { x: 380, y: 504, r: 64 },
      };
      const sp = spotMap[story.focusZone];
      if (sp) {
        c.save();
        c.strokeStyle = '#38bdf8';
        c.lineWidth = 2;
        c.setLineDash([6, 4]);
        c.beginPath();
        c.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = 'rgba(15, 23, 42, 0.88)';
        c.beginPath();
        c.roundRect(Math.max(12, sp.x - 115), Math.max(12, sp.y - sp.r - 28), 230, 22, 6);
        c.fill();
        c.strokeStyle = 'rgba(56,189,248,0.65)';
        c.lineWidth = 1;
        c.stroke();
        c.fillStyle = '#bae6fd';
        c.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
        c.textAlign = 'center';
        c.fillText(story.focusLabel, sp.x, Math.max(27, sp.y - sp.r - 13));
        c.restore();
      }
    }
  }

  // Discreet corner attribution (carried over in screenshots & videos)
  c.save();
  c.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
  c.fillStyle = 'rgba(148, 163, 184, 0.30)';
  c.textAlign = 'right';
  c.fillText('Atelier du Cœur · Dr O. Sow', W - 14, H - 10);
  c.restore();
}
