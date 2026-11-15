import { C, actOf } from '../engine/physiology';
import { beat, type CardiacClockState } from '../engine/clock';
import { clamp, seededRng } from '../engine/geometry2d';
import type { ComputedResult, SimParams } from '../engine/types';

/**
 * Synthèse Web Audio des bruits du cœur.
 *
 * Bruits : B1 (fermeture mitro-tricuspide), B2 = A2 + P2 (fermeture aortique puis
 * pulmonaire, dédoublement physiologique variable avec la respiration),
 * B3 (remplissage rapide protodiastolique : IC, IM importante), B4 (contraction
 * auriculaire contre un VG peu compliant : HVG, RA, ischémie ; absent en FA).
 * Souffles : RA (losangique mésosystolique), IM (holosystolique en plateau),
 * IA (protodiastolique décroissant), RM (roulement diastolique + renforcement
 * présystolique en rythme sinusal).
 *
 * L'intensité des souffles suit la sévérité hémodynamique et le foyer
 * d'auscultation choisi.
 */

export type FoyerId = 'tous' | 'aortique' | 'pulmonaire' | 'erb' | 'tricuspide' | 'mitral';

export const FOYERS: { id: FoyerId; label: string; court: string; lieu: string }[] = [
  { id: 'tous', label: 'Tous les bruits', court: 'Tous', lieu: 'Mélange pédagogique de tous les foyers' },
  { id: 'aortique', label: 'Foyer aortique', court: 'Ao', lieu: '2e espace intercostal droit, bord du sternum' },
  { id: 'pulmonaire', label: 'Foyer pulmonaire', court: 'Pulm', lieu: '2e espace intercostal gauche, bord du sternum' },
  { id: 'erb', label: 'Foyer d’Erb', court: 'Erb', lieu: '3e espace intercostal gauche, bord du sternum' },
  { id: 'tricuspide', label: 'Foyer tricuspide', court: 'Tric', lieu: '4e–5e espace intercostal gauche, bord du sternum' },
  { id: 'mitral', label: 'Foyer mitral (apex)', court: 'Apex', lieu: '5e espace intercostal gauche, ligne médioclaviculaire' },
];

type SoundKey = 'b1' | 'a2' | 'p2' | 'b3' | 'b4' | 'ra' | 'im' | 'ia' | 'rm';

/** Gain relatif de chaque bruit selon le foyer (1 = entendu au mieux). */
const FOYER_GAIN: Record<FoyerId, Record<SoundKey, number>> = {
  tous: { b1: 1, a2: 1, p2: 0.55, b3: 0.8, b4: 0.8, ra: 1, im: 1, ia: 1, rm: 1 },
  aortique: { b1: 0.6, a2: 1.25, p2: 0.25, b3: 0.15, b4: 0.2, ra: 1.1, im: 0.3, ia: 0.75, rm: 0.1 },
  pulmonaire: { b1: 0.6, a2: 1, p2: 1, b3: 0.15, b4: 0.2, ra: 0.75, im: 0.3, ia: 0.6, rm: 0.1 },
  erb: { b1: 0.8, a2: 0.9, p2: 0.6, b3: 0.35, b4: 0.4, ra: 0.8, im: 0.45, ia: 1.15, rm: 0.25 },
  tricuspide: { b1: 1, a2: 0.7, p2: 0.4, b3: 0.5, b4: 0.5, ra: 0.5, im: 0.55, ia: 0.8, rm: 0.35 },
  mitral: { b1: 1.25, a2: 0.6, p2: 0.15, b3: 1.1, b4: 1.1, ra: 0.5, im: 1.15, ia: 0.45, rm: 1.15 },
};

export interface HeartAudioEngine {
  ctx: AudioContext | null;
  noise: AudioBuffer | null;
  out: AudioNode | null;
  master: GainNode | null;
  streamDest: MediaStreamAudioDestinationNode | null;
  buf: Partial<Record<'b1' | 'b2' | 'b3', AudioBuffer>>;
  lastT: number;
  foyer: FoyerId;
  rnd: () => number;
}

export function createAudioEngine(): HeartAudioEngine {
  return {
    ctx: null,
    noise: null,
    out: null,
    master: null,
    streamDest: null,
    buf: {},
    lastT: 0,
    foyer: 'tous',
    // Générateur propre à l'audio : ne doit pas perturber celui de l'horloge
    // (sinon activer le son modifierait la séquence des battements en FA).
    rnd: seededRng(97),
  };
}

/**
 * Crée (ou réveille) le contexte audio. Doit être appelé directement dans un
 * gestionnaire de clic : Safari/iOS et Chrome mobile n'autorisent le son
 * qu'à l'intérieur d'un geste de l'utilisateur.
 */
export function initAudio(snd: HeartAudioEngine): AudioContext | null {
  if (snd.ctx) {
    if (snd.ctx.state === 'suspended') snd.ctx.resume().catch(() => {});
    return snd.ctx;
  }
  try {
    // iOS 16.4+ : jouer même si l'iPhone est en mode silencieux.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    /* non bloquant */
  }
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    snd.ctx = new AudioCtx();
  } catch {
    return null;
  }
  const ac = snd.ctx;
  const n = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  const r = seededRng(5);
  for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  snd.noise = buf;

  // Chaîne « stéthoscope » : coupe des infra-graves inutiles, bosse de résonance vers
  // 110 Hz, coupure des aigus (pavillon), puis légère résonance du thorax.
  const master = ac.createGain();
  master.gain.value = 0.95;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 24;
  const body = ac.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 110;
  body.Q.value = 0.9;
  body.gain.value = 4;
  const steth = ac.createBiquadFilter();
  steth.type = 'lowpass';
  steth.frequency.value = 1100;
  steth.Q.value = 0.6;
  const dry = ac.createGain();
  dry.gain.value = 0.82;
  const wet = ac.createGain();
  wet.gain.value = 0.3;
  const chest = ac.createConvolver();
  chest.buffer = chestImpulse(ac);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.14;
  master.connect(hp);
  hp.connect(body);
  body.connect(steth);
  steth.connect(dry);
  steth.connect(chest);
  chest.connect(wet);
  dry.connect(comp);
  wet.connect(comp);
  comp.connect(ac.destination);
  if (typeof ac.createMediaStreamDestination === 'function') {
    const streamDest = ac.createMediaStreamDestination();
    comp.connect(streamDest);
    snd.streamDest = streamDest;
  }
  snd.master = master;
  snd.out = master;
  // Débloque la sortie sur iOS : un tampon silencieux joué pendant le geste.
  try {
    const silent = ac.createBufferSource();
    silent.buffer = ac.createBuffer(1, 1, ac.sampleRate);
    silent.connect(ac.destination);
    silent.start(0);
  } catch {
    /* non bloquant */
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}

export function setFoyer(snd: HeartAudioEngine, foyer: FoyerId): void {
  snd.foyer = foyer;
}

export function getAudioCaptureTracks(snd: HeartAudioEngine): MediaStreamTrack[] {
  const ctx = initAudio(snd);
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return snd.streamDest ? snd.streamDest.stream.getAudioTracks() : [];
}

/** Réponse impulsionnelle courte de la cage thoracique (≈ 60 ms, sourde). */
function chestImpulse(ac: AudioContext): AudioBuffer {
  const sr = ac.sampleRate;
  const n = Math.round(sr * 0.06);
  const buf = ac.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const r = seededRng(41);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp += (r() * 2 - 1 - lp) * 0.12; // bruit filtré (grave)
    d[i] = lp * Math.exp(-t / 0.014);
  }
  d[0] = 1;
  return buf;
}

/**
 * Bruits du cœur par synthèse modale : chaque bruit est la vibration amortie des
 * valves et des parois (plusieurs modes légèrement inharmoniques). Les harmoniques
 * entre 80 et 300 Hz rendent le bruit perceptible même sur un haut-parleur de
 * téléphone ou d'ordinateur portable, qui ne restitue pas les fondamentales graves.
 */
function hsBuffer(ac: AudioContext, kind: 'b1' | 'b2' | 'b3'): AudioBuffer {
  const sr = ac.sampleRate;
  type Mode = [freq: number, amp: number, tau: number];
  const spec: { dur: number; modes: Mode[]; attack: number; split: number; k2: number; noise: number; seed: number } =
    kind === 'b1'
      ? {
          // B1 : grave, un peu long, deux composantes (mitrale puis tricuspide).
          dur: 0.17,
          modes: [[48, 1, 0.034], [74, 0.85, 0.03], [112, 0.6, 0.024], [158, 0.36, 0.018], [230, 0.16, 0.012]],
          attack: 0.004,
          split: 0.022,
          k2: 0.6,
          noise: 0.35,
          seed: 11,
        }
      : kind === 'b2'
        ? {
            // B2 : plus bref, plus claqué, plus aigu (une composante, A2 ou P2).
            dur: 0.11,
            modes: [[72, 0.8, 0.022], [108, 1, 0.02], [160, 0.7, 0.016], [235, 0.38, 0.011], [330, 0.15, 0.008]],
            attack: 0.0025,
            split: 0,
            k2: 0,
            noise: 0.3,
            seed: 23,
          }
        : {
            // B3/B4 : sourds, attaque lente, mais avec des harmoniques audibles.
            dur: 0.13,
            modes: [[38, 1, 0.045], [62, 0.8, 0.04], [96, 0.5, 0.03], [140, 0.22, 0.02]],
            attack: 0.014,
            split: 0,
            k2: 0,
            noise: 0.08,
            seed: 31,
          };
  const n = Math.round(sr * spec.dur);
  const buf = ac.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const r = seededRng(spec.seed);
  const phases = spec.modes.map(() => r() * Math.PI * 2);
  const comp = (t: number, amp: number) => {
    if (t < 0) return 0;
    const att = 1 - Math.exp(-t / spec.attack);
    let v = 0;
    spec.modes.forEach(([f, a, tau], i) => {
      // Légère chute de fréquence pendant l'amortissement (tension qui se relâche).
      const fg = f * (1 - 0.1 * Math.min(1, t / 0.05));
      v += a * Math.exp(-t / tau) * Math.sin(2 * Math.PI * fg * t + phases[i]);
    });
    return amp * att * v;
  };
  let lp = 0;
  let mx = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp += (r() * 2 - 1 - lp) * 0.1;
    const envN = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.012);
    let v = comp(t, 1) + (spec.k2 ? comp(t - spec.split, spec.k2) : 0) + spec.noise * lp * envN;
    // Saturation douce : enrichit en harmoniques (perception sur petits haut-parleurs).
    v = Math.tanh(1.3 * v);
    const tail = Math.min(1, (n - i) / (sr * 0.01));
    d[i] = v * tail;
    mx = Math.max(mx, Math.abs(d[i]));
  }
  for (let i = 0; i < n; i++) d[i] /= mx || 1;
  return buf;
}

function thump(
  snd: HeartAudioEngine,
  kind: 'b1' | 'b2' | 'b3',
  gain: number,
  delay = 0,
  cutoff = 900
): void {
  const ac = snd.ctx;
  if (!ac || gain <= 0.01) return;
  const t0 = ac.currentTime + 0.008 + Math.max(0, delay);
  if (!snd.buf[kind]) snd.buf[kind] = hsBuffer(ac, kind);
  const src = ac.createBufferSource();
  src.buffer = snd.buf[kind]!;
  const lpf = ac.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = cutoff;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(lpf);
  lpf.connect(g);
  g.connect(snd.out || ac.destination);
  src.start(t0);
}

type MurmurShape = 'losange' | 'plateau' | 'decroissant' | 'roulement';

function murmur(
  snd: HeartAudioEngine,
  spec: { frequence: number; volume: number },
  gain: number,
  dur: number,
  shape: MurmurShape,
  presystolic = false
): void {
  const ac = snd.ctx;
  if (!ac || !snd.noise || dur <= 0.03 || gain <= 0.01) return;
  const t0 = ac.currentTime + 0.01;
  const out = snd.out || ac.destination;
  const ns = ac.createBufferSource();
  ns.buffer = snd.noise;
  ns.loop = true;
  ns.playbackRate.value = 0.95 + snd.rnd() * 0.1;
  const gg = ac.createGain();
  gg.gain.setValueAtTime(0.0001, t0);
  let chain: AudioNode = ns;
  if (shape === 'roulement') {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = spec.frequence * 1.6;
    lp.Q.value = 2;
    chain.connect(lp);
    chain = lp;
  } else {
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = spec.frequence * 0.45;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = spec.frequence;
    // RA rude et râpeux (bande large) ; IA doux, aspiratif (aigu, bande étroite).
    bp.Q.value = shape === 'losange' ? 0.7 : shape === 'decroissant' ? 1.4 : 1.1;
    chain.connect(hp);
    hp.connect(bp);
    chain = bp;
  }
  const v = spec.volume * gain;
  if (shape === 'losange') {
    gg.gain.linearRampToValueAtTime(v, t0 + dur * 0.45);
    gg.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  } else if (shape === 'decroissant') {
    gg.gain.linearRampToValueAtTime(v, t0 + 0.02);
    gg.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  } else if (shape === 'roulement') {
    gg.gain.linearRampToValueAtTime(v * 0.75, t0 + Math.min(0.06, dur * 0.2));
    gg.gain.linearRampToValueAtTime(v * 0.35, t0 + dur * 0.6);
    // Renforcement présystolique : seulement si les oreillettes se contractent.
    gg.gain.linearRampToValueAtTime(presystolic ? v : v * 0.3, t0 + dur * 0.95);
    gg.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  } else {
    gg.gain.linearRampToValueAtTime(v, t0 + Math.min(0.03, dur * 0.2));
    gg.gain.setValueAtTime(v, t0 + Math.max(0.03, dur - 0.03));
    gg.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  }
  // Texture : le RA est râpeux (modulation rapide irrégulière), le roulement du RM
  // vibre (trémolo grave). Les souffles de fuite restent doux et réguliers.
  if (shape === 'losange' || shape === 'roulement') {
    const lfo = ac.createOscillator();
    lfo.type = shape === 'losange' ? 'sawtooth' : 'sine';
    lfo.frequency.value = shape === 'losange' ? 38 + snd.rnd() * 10 : 24;
    const depth = ac.createGain();
    depth.gain.value = shape === 'losange' ? 0.45 : 0.35;
    const am = ac.createGain();
    am.gain.value = 1;
    lfo.connect(depth);
    depth.connect(am.gain);
    chain.connect(am);
    am.connect(gg);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.03);
  } else {
    chain.connect(gg);
  }
  gg.connect(out);
  ns.start(t0);
  ns.stop(t0 + dur + 0.03);
}

/** Phase respiratoire (0 = expiration, 1 = fin d'inspiration), cycle de 4 s. */
export function inspiration(t: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 4);
}

export interface AuscultationFindings {
  b3: boolean;
  b4: boolean;
  souffleRA: number;
  souffleIM: number;
  souffleIA: number;
  roulementRM: boolean;
}

/**
 * Ce que l'on doit entendre, d'après l'état hémodynamique (testable sans audio).
 * hvg : hypertrophie ventriculaire gauche réelle (0–1), pas la cible.
 */
export function auscultationFindings(p: SimParams, r: ComputedResult, hvg = 0): AuscultationFindings {
  const sinusAtrial = r.atriaOK && r.rythme !== 'fa' && r.rythme !== 'flutter';
  const raActive = r.surfAo < 1.5 || actOf('pulmonaire', p) === 'stenose';
  const rmActive = actOf('mitrale', p) === 'stenose';
  return {
    // B3 : remplissage rapide d'un VG dilaté/défaillant ou surchargé en volume (IC à FE
    // basse, pression télédiastolique VG élevée, IM importante). Absent dans le RM :
    // l'obstacle mitral empêche justement ce remplissage rapide.
    b3: !rmActive && (r.fe < 0.42 || r.ptdvg >= 15 || r.rf >= 0.3),
    // B4 : systole auriculaire contre un VG peu compliant (HVG, RA, ischémie, VG rigide
    // à FE conservée). Impossible sans contraction auriculaire efficace (FA, flutter).
    b4:
      sinusAtrial &&
      r.rythme !== 'bav3' &&
      (hvg >= 0.4 || r.surfAo < 1.2 || r.zoneIDM !== null || (r.ptdvg >= 11 && r.fe >= 0.45)),
    souffleRA: raActive ? clamp(Math.max(r.grad / 40, actOf('pulmonaire', p) === 'stenose' ? 0.7 : 0), 0.3, 1.25) : 0,
    souffleIM: r.rf > 0 ? clamp(r.rf / 0.45, 0.3, 1.2) : 0,
    souffleIA: r.rfAo > 0 ? clamp(r.rfAo / 0.42, 0.3, 1.2) : 0,
    roulementRM: actOf('mitrale', p) === 'stenose',
  };
}

export function sndTick(
  snd: HeartAudioEngine,
  clk: CardiacClockState,
  p: SimParams,
  r: ComputedResult,
  soundEnabled: boolean,
  hvg = 0
): void {
  const t = clk.t;
  if (!soundEnabled || !snd.ctx || !clk.playing || snd.ctx.state !== 'running') {
    snd.lastT = t;
    return;
  }
  if (t - snd.lastT > 0.5 || t < snd.lastT) {
    snd.lastT = t;
    return;
  }

  let i0 = 0;
  for (let idx = clk.vEv.length - 1; idx >= 0; idx--) {
    if (clk.vEv[idx].t <= snd.lastT) {
      i0 = Math.max(0, idx - 1);
      break;
    }
  }
  let i1 = clk.vEv.length - 1;
  for (let idx = clk.vEv.length - 1; idx >= 0; idx--) {
    if (clk.vEv[idx].t <= t) {
      i1 = idx;
      break;
    }
  }

  const fg = FOYER_GAIN[snd.foyer];
  const f = auscultationFindings(p, r, hvg);
  const spd = clk.speed;
  const passed = (x: number) => x > snd.lastT && x <= t;
  const ms = f.roulementRM;

  for (let i = i0; i <= i1; i++) {
    if (!clk.vEv[i]) continue;
    const b = beat(clk, r, clk.vEv[i].t + 0.0001);
    const vol = clamp(0.6 + 0.4 * r.contract, 0.4, 1.2);

    // B4 : télédiastole, juste après la contraction auriculaire (~ 80 ms avant B1).
    if (f.b4 && b.a && b.a.t + 0.06 < b.sys) {
      const tB4 = b.a.t + 0.06;
      if (passed(tB4)) thump(snd, 'b3', 0.62 * fg.b4, 0, 320);
    }

    if (passed(b.sys)) {
      const b1Var = r.rythme === 'fa' ? 0.7 + 0.6 * snd.rnd() : 1; // intensité variable en FA
      thump(snd, 'b1', C.sons.b1.volume * vol * b1Var * (ms ? 1.35 : 1) * (r.rf > 0 ? 0.75 : 1) * fg.b1);
      if (f.souffleIM > 0) {
        // Holosystolique : de B1 jusqu'à (et masquant en partie) B2.
        murmur(snd, C.sons.souffleIM, f.souffleIM * fg.im, (b.ej1 + 0.02 - b.sys) / spd, 'plateau');
      }
    }

    if (f.souffleRA > 0 && passed(b.ej0)) {
      murmur(snd, C.sons.souffleRA, f.souffleRA * fg.ra, ((b.ej1 - b.ej0) / spd) * 0.95, 'losange');
    }

    if (passed(b.ej1)) {
      // A2 : diminué dans le RA serré, claqué dans l'HTA.
      const a2 = C.sons.b2.volume * vol * (r.surfAo < 1 ? 0.45 : 1) * (1 + 0.25 * clamp((r.pas - 130) / 40, 0, 1));
      thump(snd, 'b2', a2 * fg.a2);
      // P2 : dédoublement physiologique, plus large à l'inspiration (retour veineux ↑).
      // Ralenti avec la vitesse pour devenir audible en ×0,5 / ×0,25.
      const split = (0.015 + 0.04 * inspiration(b.ej1)) / spd;
      thump(snd, 'b2', a2 * 0.75 * fg.p2, split, 640);
      if (f.souffleIA > 0) {
        murmur(snd, C.sons.souffleIA, f.souffleIA * fg.ia, ((b.nx.t - b.ej1) * 0.55) / spd, 'decroissant');
      }
    }

    // B3 : ~ 140 ms après B2, fin du remplissage rapide.
    const tB3 = b.ej1 + 0.14;
    if (f.b3 && tB3 < b.nx.t - 0.05 && passed(tB3)) {
      thump(snd, 'b3', 0.68 * fg.b3, 0, 320);
    }

    if (ms && passed(b.ivr + 0.04)) {
      murmur(
        snd,
        C.sons.roulementRM,
        fg.rm,
        Math.max(0.05, b.nx.t + 0.02 - b.ivr - 0.04) / spd,
        'roulement',
        r.atriaOK && r.rythme !== 'fa'
      );
    }
  }
  snd.lastT = t;
}
