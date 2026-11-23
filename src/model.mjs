// Dimensionless teaching geometry, NOT a quantitative equation of state.
// The single-phase fluid is one cubic sheet in a logarithmic volume coordinate.
// Below Tc its unstable middle is replaced by an equilibrium coexistence patch.
export const TRIPLE_T = 0.25, CRITICAL_T = 0.76, CRITICAL_V = 2.2;
export const TRIPLE_P = 0.18, CRITICAL_P = 0.65;
export const MIN_P = 0.035, MAX_P = 1.12, MAX_T = 1.06;
export const COLORS = { solid: '#6998d2', liquid: '#4cae9b', vapor: '#e6a16d', fluid: '#71b9b1', lv: '#e8c45b', sl: '#aa93ca', sv: '#a9bdc3' };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mix = (a, b, u) => a + (b - a) * u;
const V_FLOOR = 0.45, CUBIC_SCALE = 0.5;
const ORDER_SCALE = 0.9 ** 2 / (CRITICAL_T - TRIPLE_T);
const SATURATION_SLOPE = (CRITICAL_P - TRIPLE_P) / (CRITICAL_T - TRIPLE_T);
// Extended beyond coexistence only as the center of the schematic fluid sheet.
const centerP = t => TRIPLE_P + SATURATION_SLOPE * (t - TRIPLE_T);
const orderV = r => V_FLOOR + (CRITICAL_V - V_FLOOR) * Math.exp(r);
export const volumeOrder = v => Math.log((v - V_FLOOR) / (CRITICAL_V - V_FLOOR));
const orderHalfWidth = t => Math.sqrt(Math.max(0, ORDER_SCALE * (CRITICAL_T - t)));
export const saturationP = t => centerP(clamp(t, TRIPLE_T, CRITICAL_T));
export const boilingT = p => TRIPLE_T + (CRITICAL_T - TRIPLE_T) * clamp((p - TRIPLE_P) / (CRITICAL_P - TRIPLE_P), 0, 1);
export const sublimationP = t => 0.018 + (TRIPLE_P - 0.018) * Math.pow(clamp(t / TRIPLE_T, 0, 1), 1.6);
export const sublimationT = p => TRIPLE_T * Math.pow(clamp((p - 0.018) / (TRIPLE_P - 0.018), 0, 1), 1 / 1.6);
export const meltingT = (p, water) => TRIPLE_T + (water ? -1 : 1) * 0.145 * (p - TRIPLE_P);
export const solidV = (t, p, water) => (water ? 1.52 : 0.78) + 0.12 * (t - TRIPLE_T) - 0.065 * (p - TRIPLE_P);
export const saturatedLiquidV = t => orderV(-orderHalfWidth(t));
export const saturatedVaporV = t => orderV(orderHalfWidth(t));

// Stable outside branches of the SAME cubic, with no van der Waals loop shown.
// At criticality p_v and p_vv both vanish, with a common tangent plane.
export function fluidPressure(t, v) {
  const r = volumeOrder(v);
  return centerP(t) - CUBIC_SCALE * (r ** 3 + ORDER_SCALE * (t - CRITICAL_T) * r);
}
function stableVolume(t, p, branch) {
  const a = ORDER_SCALE * (t - CRITICAL_T);
  const spinodal = Math.sqrt(Math.max(0, -a / 3));
  let low = t < CRITICAL_T && branch === 'vapor' ? spinodal : -4;
  let high = t < CRITICAL_T && branch === 'liquid' ? -spinodal : 4;
  const target = (centerP(t) - p) / CUBIC_SCALE;
  for (let i = 0; i < 48; i++) {
    const r = (low + high) / 2;
    if (r ** 3 + a * r < target) low = r; else high = r;
  }
  return orderV((low + high) / 2);
}
export const liquidV = (t, p) => stableVolume(t, p, 'liquid');
export const vaporV = (t, p) => stableVolume(t, p, 'vapor');
export const fluidV = (t, p) => stableVolume(t, p, 'fluid');
export const tripleVolumeRange = water => {
  const volumes = [solidV(TRIPLE_T, TRIPLE_P, water), saturatedLiquidV(TRIPLE_T), saturatedVaporV(TRIPLE_T)];
  return [Math.min(...volumes), Math.max(...volumes)];
};
export const volumeX = v => -3 + 6 * Math.log1p(v) / Math.log(11);
export const xVolume = x => Math.expm1((x + 3) * Math.log(11) / 6);
export const pressureY = p => 4.5 * p;
export const temperatureZ = t => 2.6 - 5 * t;
export const point = (v, p, t) => [volumeX(v), pressureY(p), temperatureZ(t)];

// Shared analytical normals prevent a lighting seam at the arbitrary T=Tc mesh split.
export function fluidNormal(t, v) {
  const r = volumeOrder(v);
  const dxdr = 6 * (v - V_FLOOR) / ((1 + v) * Math.log(11));
  const dpdr = -CUBIC_SCALE * (3 * r * r + ORDER_SCALE * (t - CRITICAL_T));
  const dpdt = SATURATION_SLOPE - CUBIC_SCALE * ORDER_SCALE * r;
  const normal = [-4.5 * dpdr / dxdr, 1, 4.5 * dpdt / 5];
  const length = Math.hypot(...normal);
  return normal.map(x => x / length);
}

// Cluster both sides on Pc. Every shared mesh edge uses identical samples,
// including the critical vertex, rather than merely coinciding analytically.
export const lowPressure = u => mix(MIN_P, TRIPLE_P, u);
export const vaporPressure = u => CRITICAL_P - (CRITICAL_P - TRIPLE_P) * (1 - u) ** 2;
export const liquidPressure = u => CRITICAL_P + (MAX_P - CRITICAL_P) * u ** 2;
export const coexistenceT = u => CRITICAL_T - (CRITICAL_T - TRIPLE_T) * (1 - u) ** 2;

export function patches(water = false) {
  const solid = (p0, p1, low) => (u, w) => {
    const p = mix(p0, p1, u), t = w * (low ? sublimationT(p) : meltingT(p, water));
    return point(solidV(t, p, water), p, t);
  };
  const vapor = (pressure, low) => (u, w) => {
    const p = pressure(u), t = mix(low ? sublimationT(p) : boilingT(p), CRITICAL_T, w);
    return point(vaporV(t, p), p, t);
  };
  const highT = pressure => (u, w) => {
    const p = pressure(u), t = mix(CRITICAL_T, MAX_T, w);
    return point(fluidV(t, p), p, t);
  };
  return [
    { name: 'solid', fn: solid(MIN_P, TRIPLE_P, true) },
    { name: 'solid', fn: solid(TRIPLE_P, MAX_P, false) },
    { name: 'liquid', fn: (u, w) => {
      const p = vaporPressure(u), t = mix(meltingT(p, water), boilingT(p), w);
      return point(liquidV(t, p), p, t);
    } },
    { name: 'liquid', fn: (u, w) => {
      const p = liquidPressure(u), t = mix(meltingT(p, water), CRITICAL_T, w);
      return point(liquidV(t, p), p, t);
    } },
    { name: 'vapor', fn: vapor(lowPressure, true) },
    { name: 'vapor', fn: vapor(vaporPressure, false) },
    { name: 'fluid', fn: highT(lowPressure) },
    { name: 'fluid', fn: highT(vaporPressure) },
    { name: 'fluid', fn: highT(liquidPressure) },
    { name: 'lv', fn: (u, w) => {
      const t = coexistenceT(u);
      return point(mix(saturatedLiquidV(t), saturatedVaporV(t), w), saturationP(t), t);
    } },
    { name: 'sl', fn: (u, w) => {
      const p = mix(TRIPLE_P, MAX_P, u), t = meltingT(p, water);
      return point(mix(solidV(t, p, water), liquidV(t, p), w), p, t);
    } },
    { name: 'sv', fn: (u, w) => {
      const p = lowPressure(u), t = sublimationT(p);
      return point(mix(solidV(t, p, water), vaporV(t, p), w), p, t);
    } },
  ];
}
