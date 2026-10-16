import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from './model.mjs';
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const same = (a, b) => a.forEach((v, i) => near(v, b[i]));

test('saturation and sublimation curves meet at the triple state', () => {
  near(m.saturationP(m.TRIPLE_T), m.TRIPLE_P);
  near(m.sublimationP(m.TRIPLE_T), m.TRIPLE_P);
  near(m.saturationP(m.CRITICAL_T), m.CRITICAL_P);
  for (let t = m.TRIPLE_T; t <= m.CRITICAL_T; t += 0.01) near(m.boilingT(m.saturationP(t)), t);
  for (let t = 0.05; t <= m.TRIPLE_T; t += 0.01) near(m.sublimationT(m.sublimationP(t)), t);
});

test('triple line includes every pure-phase volume in both freezing modes', () => {
  for (const water of [false, true]) {
    const [low, high] = m.tripleVolumeRange(water);
    near(low, water ? m.saturatedLiquidV(m.TRIPLE_T) : m.solidV(m.TRIPLE_T, m.TRIPLE_P, water));
    near(high, m.saturatedVaporV(m.TRIPLE_T));
  }
});

test('saturated volumes converge on the critical point without crossing', () => {
  near(m.saturatedLiquidV(m.CRITICAL_T), m.CRITICAL_V);
  near(m.saturatedVaporV(m.CRITICAL_T), m.CRITICAL_V);
  for (let t = m.TRIPLE_T; t < m.CRITICAL_T; t += 0.01) {
    assert.ok(m.saturatedLiquidV(t) < m.saturatedVaporV(t));
    near(m.fluidPressure(t, m.saturatedLiquidV(t)), m.saturationP(t));
    near(m.fluidPressure(t, m.saturatedVaporV(t)), m.saturationP(t));
  }
});

test('critical isotherm is smooth and has a horizontal inflection, not a cusp or jump', () => {
  const { CRITICAL_T: t, CRITICAL_V: v, CRITICAL_P: p } = m;
  const h = 1e-3;
  near(m.fluidPressure(t, v), p);
  const left = m.fluidPressure(t, v - h), right = m.fluidPressure(t, v + h);
  near((right - left) / (2 * h), 0, 1e-6);
  near((right - 2 * p + left) / h ** 2, 0, 1e-6);
  assert.ok(left > p && right < p);
  for (const fn of [m.liquidV, m.vaporV, m.fluidV]) near(fn(t, p), v, 1e-8);
});

test('vapor and liquid extend through Tc on the SAME fluid sheet', () => {
  for (let p = m.MIN_P; p <= m.MAX_P; p += 0.013) {
    const branch = p < m.CRITICAL_P ? m.vaporV : m.liquidV;
    near(branch(m.CRITICAL_T, p), m.fluidV(m.CRITICAL_T, p));
    const dt = 1e-6, below = branch(m.CRITICAL_T - dt, p), above = m.fluidV(m.CRITICAL_T + dt, p);
    assert.ok(Math.abs(below - above) < 0.001);
    same(m.fluidNormal(m.CRITICAL_T, branch(m.CRITICAL_T, p)), m.fluidNormal(m.CRITICAL_T, m.fluidV(m.CRITICAL_T, p)));
  }
  const v = m.fluidV(m.CRITICAL_T, m.MIN_P);
  assert.ok(v > m.CRITICAL_V * 2, 'critical isotherm extends into the vapor region rather than a thin vertical sheet');
});

test('stable fluid isotherms decrease with volume and expand with temperature', () => {
  for (const t of [0.3, 0.48, 0.7, m.CRITICAL_T, 0.9, 1.03]) {
    for (let p = m.MIN_P; p < m.MAX_P; p += 0.02) {
      const fn = t >= m.CRITICAL_T ? m.fluidV : p < m.saturationP(t) ? m.vaporV : m.liquidV;
      const v = fn(t, p);
      near(m.fluidPressure(t, v), p, 1e-8);
      assert.ok(fn(t, p + 1e-5) < v);
      // Stay on the same stable branch away from the saturation boundary.
      if (Math.abs(p - m.saturationP(t)) > 0.01) assert.ok(fn(t + 1e-5, p) > v);
    }
  }
});

for (const water of [false, true]) {
  const name = water ? 'water-like' : 'ordinary';
  test(`${name} freezing has consistent volume ordering and melting slope`, () => {
    assert.equal(m.meltingT(m.MAX_P, water) < m.TRIPLE_T, water);
    for (let p = m.TRIPLE_P; p <= m.MAX_P; p += 0.005) {
      const t = m.meltingT(p, water);
      assert.equal(m.solidV(t, p, water) > m.liquidV(t, p), water);
    }
  });
  test(`${name} patches are finite, bounded, and meet the shared fluid relation`, () => {
    const patches = m.patches(water);
    assert.equal(patches.length, 12);
    for (const patch of patches) for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) {
      const [x, y, z] = patch.fn(i / 24, j / 24);
      assert.ok([x, y, z].every(Number.isFinite), patch.name);
      assert.ok(x >= -3 && x <= 3 && y > 0 && y <= m.MAX_P * 4.5 + 1e-9 && z <= 2.6 && z >= m.temperatureZ(m.MAX_T) - 1e-9, patch.name);
      if (['liquid', 'vapor', 'fluid'].includes(patch.name)) near(m.fluidPressure((2.6 - z) / 5, m.xVolume(x)), y / 4.5, 1e-8);
    }
  });
  test(`${name} sampled fluid and coexistence edges match point for point`, () => {
    const p = m.patches(water);
    for (let i = 0; i <= 60; i++) {
      const u = i / 60;
      // These are the actual mesh parameter samples, not just analytical endpoints.
      for (const [a, b] of [[4, 6], [5, 7], [3, 8]]) same(p[a].fn(u, 1), p[b].fn(u, 0));
      same(p[2].fn(u, 1), p[9].fn(u, 0));
      same(p[5].fn(u, 0), p[9].fn(u, 1));
      const pressure = m.TRIPLE_P + (m.MAX_P - m.TRIPLE_P) * u, t = m.meltingT(pressure, water);
      same(p[10].fn(u, 0), m.point(m.solidV(t, pressure, water), pressure, t));
      same(p[10].fn(u, 1), m.point(m.liquidV(t, pressure), pressure, t));
    }
    same(p[11].fn(1, 0), p[10].fn(0, 0));
    same(p[11].fn(1, 1), p[9].fn(0, 1));
    same(p[10].fn(0, 1), p[9].fn(0, 0));
  });
}
