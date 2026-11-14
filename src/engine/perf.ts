import type { DisplayProfile } from './types';

/**
 * Qualité graphique adaptative.
 *
 * Les trois profils d'affichage (Complet / Équilibré / Léger) pilotent la
 * résolution des canevas 2D et 3D, l'anticrénelage et la cadence d'image.
 * Au démarrage, on choisit un profil d'après le matériel ; ensuite un
 * « gouverneur » mesure la fluidité réelle et descend d'un cran si l'appareil
 * peine (jamais de remontée automatique, pour éviter les oscillations).
 */

export interface PerfSettings {
  /** Densité de pixels maximale des canevas 2D. */
  dpr2d: number;
  /** Densité de pixels maximale du rendu WebGL. */
  dpr3d: number;
  antialias: boolean;
  /** Cadence de dessin visée (images/s). La simulation et le son restent exacts. */
  fps: number;
  /** Particules réduites dans les flux sanguins. */
  lightParticles: boolean;
}

const SETTINGS: Record<DisplayProfile, PerfSettings> = {
  complet: { dpr2d: 2, dpr3d: 2, antialias: true, fps: 60, lightParticles: false },
  equilibre: { dpr2d: 1.5, dpr3d: 1.25, antialias: true, fps: 60, lightParticles: false },
  leger: { dpr2d: 1, dpr3d: 1, antialias: false, fps: 30, lightParticles: true },
};

let current: DisplayProfile = 'complet';

export function perf(): PerfSettings {
  return SETTINGS[current];
}

export function setPerfProfile(p: DisplayProfile): void {
  current = p;
}

export function dpr2d(): number {
  return Math.min(SETTINGS[current].dpr2d, window.devicePixelRatio || 1);
}

export function dpr3d(): number {
  return Math.min(SETTINGS[current].dpr3d, window.devicePixelRatio || 1);
}

function gpuName(): string {
  try {
    const c = document.createElement('canvas');
    const gl =
      (c.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (c.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}

/** Profil de départ selon le matériel détecté. */
export function detectInitialProfile(): DisplayProfile {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const cores = nav.hardwareConcurrency || 4;
    const mem = nav.deviceMemory ?? 8;
    const gpu = gpuName();
    const mobile = /Android|iPhone|iPad|Mobile/i.test(nav.userAgent);
    const softGpu = /SwiftShader|llvmpipe|softpipe/i.test(gpu);
    // GPU intégrés anciens (Intel HD Graphics ≤ 2016, Iris non-Xe), petits GPU mobiles.
    const oldGpu = /Intel.*\bHD Graphics\b|Intel.*Iris(?!.*Xe)|Mali-[GT]\d{2}\b|Adreno\D*[3-5]\d{2}\b|PowerVR/i.test(gpu);
    // GPU intégrés récents mais modestes.
    const midGpu = /Intel.*UHD Graphics|Mali-G\d{3}|Adreno\D*6\d{2}\b/i.test(gpu);
    if (softGpu || oldGpu || cores <= 2 || mem <= 2) return 'leger';
    if (midGpu) return 'equilibre';
    if (mobile || cores <= 4 || mem <= 4) return 'equilibre';
    return 'complet';
  } catch {
    return 'equilibre';
  }
}

/**
 * Mesure la durée moyenne des images. Renvoie le profil inférieur si
 * l'affichage est durablement saccadé (< ~24 i/s pendant ~2,5 s).
 */
export function createGovernor() {
  let acc = 0;
  let n = 0;
  let windowStart = 0;
  let cooldownUntil = 0;
  return {
    /** dtMs : intervalle réel entre deux images. now : performance.now(). */
    sample(dtMs: number, now: number, profile: DisplayProfile): DisplayProfile | null {
      if (document.hidden || dtMs > 1000) {
        acc = 0;
        n = 0;
        windowStart = now;
        return null;
      }
      if (now < cooldownUntil) return null;
      if (!windowStart) windowStart = now;
      acc += dtMs;
      n++;
      if (now - windowStart < 2500) return null;
      const avg = acc / Math.max(1, n);
      acc = 0;
      n = 0;
      windowStart = now;
      if (avg > 42 && profile !== 'leger') {
        cooldownUntil = now + 3000;
        return profile === 'complet' ? 'equilibre' : 'leger';
      }
      return null;
    },
    reset(now: number) {
      acc = 0;
      n = 0;
      windowStart = now;
      cooldownUntil = now + 3000;
    },
  };
}
