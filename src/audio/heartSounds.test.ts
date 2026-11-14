import test from 'node:test';
import assert from 'node:assert/strict';
import { compute, freshP } from '../engine/physiology';
import type { MaladieId } from '../engine/types';
import { auscultationFindings, inspiration } from './heartSounds';

function findings(mal: MaladieId[], hvg = 0) {
  const p = freshP();
  mal.forEach((m) => (p.mal[m] = true));
  return auscultationFindings(p, compute(p, { hvg }));
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
