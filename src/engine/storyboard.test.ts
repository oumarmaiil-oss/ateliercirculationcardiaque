import test from 'node:test';
import assert from 'node:assert/strict';
import { CLINICAL_CASES, projectTimelineState } from './clinicalCases';
import { applyPresetToParams } from './physiology';
import { getStoryboardMoment, interpolateTimelineProjection } from './storyboard';

test('Dyslipidémie non traitée : progression jusqu’au blocage puis détachement du caillot', () => {
  const { params, d } = applyPresetToParams({ mal: ['dyslipidemie'], site: 'carotide' });
  const p0 = projectTimelineState(params, d.hvg, null, 0, 'untreated');
  const p2 = projectTimelineState(params, d.hvg, null, 2, 'untreated');
  const p3 = projectTimelineState(params, d.hvg, null, 3, 'untreated');

  assert.equal(p0.params.plaque, 0);
  assert.equal(p2.params.plaque, 5);
  assert.equal(p3.params.plaque, 6);
  assert.equal(p3.params.mal.avc, true, 'En carotide à 5 ans, le caillot détaché provoque un AVC');

  const m2 = getStoryboardMoment('libre', null, params, 'untreated', 2);
  const m3 = getStoryboardMoment('libre', null, params, 'untreated', 3);
  assert.equal(m2.focusTab, 'vaisseau');
  assert.equal(m2.embolDetached, false);
  assert.equal(m3.embolDetached, true);
});

test('Dyslipidémie + Statine + Antiagrégant : lyse du caillot et chape consolidée', () => {
  const c6 = CLINICAL_CASES.find((c) => c.id === 'idm-plaque')!;
  const { params, d } = applyPresetToParams({
    ...c6.preset,
    trt: ['statine', 'antiagregant', 'iec', 'betabloquant'],
  });
  const p0 = projectTimelineState(params, d.hvg, c6, 0, 'treated');
  const p3 = projectTimelineState(params, d.hvg, c6, 3, 'treated');
  assert.ok(p3.params.plaque < p0.params.plaque, 'La plaque doit régresser/se stabiliser sous statine');

  const m1 = getStoryboardMoment('cas', c6, params, 'treated', 1);
  const m3 = getStoryboardMoment('cas', c6, params, 'treated', 3);
  assert.ok(m1.treatmentHeal > 0.4);
  assert.equal(m3.treatmentHeal, 1);
  assert.equal(m3.embolDetached, false);
});

test('Généralisation : FA non traitée enchaîne stase OG -> caillot -> embole -> AVC', () => {
  const c5 = CLINICAL_CASES.find((c) => c.id === 'fa-rapide')!;
  const { params } = applyPresetToParams(c5.preset);
  const m0 = getStoryboardMoment('cas', c5, params, 'untreated', 0);
  const m1 = getStoryboardMoment('cas', c5, params, 'untreated', 1);
  const m2 = getStoryboardMoment('cas', c5, params, 'untreated', 2);
  const m3 = getStoryboardMoment('cas', c5, params, 'untreated', 3);

  assert.equal(m0.focusZone, 'og');
  assert.equal(m1.focusZone, 'og');
  assert.equal(m2.embolDetached, true);
  assert.equal(m3.focusZone, 'cerveau');

  const { params: treatedP } = applyPresetToParams({ ...c5.preset, trt: ['anticoagulant', 'betabloquant'] });
  const tm2 = getStoryboardMoment('cas', c5, treatedP, 'treated', 2);
  assert.equal(tm2.embolDetached, false);
  assert.ok(tm2.treatmentHeal >= 0.8);
});

test('interpolateTimelineProjection interpole progressivement plaque, rigidité et HVG', () => {
  const c6 = CLINICAL_CASES.find((c) => c.id === 'idm-plaque')!;
  const { params, d } = applyPresetToParams({ ...c6.preset, trt: ['statine', 'antiagregant'] });
  const p0 = projectTimelineState(params, d.hvg, c6, 0, 'treated');
  const p3 = projectTimelineState(params, d.hvg, c6, 3, 'treated');
  const mid = interpolateTimelineProjection(p0, p3, 0.5);
  assert.ok(mid.params.plaque <= p0.params.plaque && mid.params.plaque >= p3.params.plaque);
  assert.ok(mid.d.hvg >= 0 && mid.d.hvg <= 1);
});
