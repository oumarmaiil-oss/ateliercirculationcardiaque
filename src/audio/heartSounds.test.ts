import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPresetToParams, compute, freshP } from '../engine/physiology';
import type { MaladieId, PresetConfig } from '../engine/types';
import { auscultationFindings, inspiration } from './heartSounds';

function findings(mal: MaladieId[], hvg = 0) {
  const p = freshP();
  mal.forEach((m) => (p.mal[m] = true));
  return auscultationFindings(p, compute(p, { hvg }), hvg);
}

function findingsPreset(o: PresetConfig) {
  const { params, d } = applyPresetToParams(o);
  return auscultationFindings(params, compute(params, d), d.hvg);
}

test('sujet sain : B1-B2 seuls, ni B3, ni B4, ni souffle', () => {
  const f = findings([]);
  assert.equal(f.b3, false);
  assert.equal(f.b4, false);
  assert.equal(f.souffleRA + f.souffleIM + f.souffleIA, 0);
  assert.equal(f.roulementRM, false);
});

test('insuffisance cardiaque à FE réduite : B3 présent', () => {
  assert.equal(findings(['ic']).b3, true);
});

test('IM importante : souffle holosystolique et B3', () => {
  const f = findings(['im']);
  assert.ok(f.souffleIM > 0.8);
  assert.equal(f.b3, true);
});

test('RA serré : souffle systolique fort et B4 (VG peu compliant)', () => {
  const f = findings(['ra'], 0.5);
  assert.ok(f.souffleRA >= 0.9, `intensité RA ${f.souffleRA}`);
  assert.equal(f.b4, true);
});

test('fibrillation auriculaire : jamais de B4 (pas de systole auriculaire)', () => {
  assert.equal(findings(['fa'], 0.6).b4, false);
  assert.equal(findings(['fa', 'ra'], 0.6).b4, false);
});

test('respiration : dédoublement de B2 maximal en fin d’inspiration', () => {
  assert.ok(inspiration(0) < 0.01);
  assert.ok(inspiration(2) > 0.99);
});

test('insuffisance cardiaque à FE réduite : B3 sans B4 (VG dilaté)', () => {
  const f = findings(['ic']);
  assert.equal(f.b3, true);
  assert.equal(f.b4, false);
});

test('rétrécissement mitral : roulement diastolique, jamais de B3', () => {
  const f = findingsPreset({ act: { mitrale: 'stenose' } });
  assert.equal(f.roulementRM, true);
  assert.equal(f.b3, false);
});

test('HTA ancienne avec HVG : B4, sans B3', () => {
  const f = findingsPreset({ mal: ['hta'], hvg: 0.9 });
  assert.equal(f.b4, true);
  assert.equal(f.b3, false);
});

test('insuffisance aortique : souffle diastolique isolé', () => {
  const f = findingsPreset({ act: { aortique: 'fuite' } });
  assert.ok(f.souffleIA > 0.8);
  assert.equal(f.souffleRA + f.souffleIM, 0);
});
