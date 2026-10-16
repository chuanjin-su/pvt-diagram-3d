import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { patches, COLORS, TRIPLE_T, TRIPLE_P, CRITICAL_T, CRITICAL_P, CRITICAL_V,
  MAX_P, MAX_T, pressureY, point, solidV, liquidV, vaporV, fluidV, saturationP, coexistenceT,
  saturatedLiquidV, saturatedVaporV, meltingT, tripleVolumeRange, temperatureZ,
  xVolume, volumeOrder, fluidNormal } from './model.mjs';

const $ = id => document.getElementById(id);
const scene = new THREE.Scene();
const container = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (error) {
  $('error').hidden = false;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);
const camera = new THREE.OrthographicCamera(-6, 6, 4.2, -4.2, 0.1, 100);
function createControls() {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minZoom = 0.5;
  controls.maxZoom = 3;
  controls.maxPolarAngle = Math.PI * 0.94;
  return controls;
}
let controls = createControls();
scene.add(new THREE.HemisphereLight(0xffffff, 0xc2c9d2, 2.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.3);
sun.position.set(3, 9, 5);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xd9edff, 1);
fill.position.set(-5, 3, -4);
scene.add(fill);
const model = new THREE.Group(), guides = new THREE.Group(), labels = new THREE.Group();
const boundaryLabels = new THREE.Group(), axes = new THREE.Group(), slice = new THREE.Group();
const axisLabels = new THREE.Group(), sliceLabels = new THREE.Group();
scene.add(model, guides, labels, boundaryLabels, axes, slice, axisLabels, sliceLabels);
let meshes = [], water = false, currentView = 'home', sliceMode = 'temperature';
let sectionDiagnostics = {};

function clear(group) {
  for (const child of [...group.children]) {
    child.traverse(o => {
      o.geometry?.dispose();
      if (o.material) {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials) { m.map?.dispose(); m.dispose(); }
      }
    });
    group.remove(child);
  }
}
function line(points, color, parent, opacity = 1, radius = 0) {
  if (radius) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, points.length * 2), radius, 6, false), new THREE.MeshBasicMaterial({ color }));
    parent.add(mesh);
    return mesh;
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  const result = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  parent.add(result);
  return result;
}
function label(text, position, parent, { color = '#334f61', size = 0.31, background = true } = {}) {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  ctx.font = '500 36px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  const width = Math.ceil(ctx.measureText(text).width) + 30;
  canvas.width = width; canvas.height = 62;
  if (background) {
    ctx.fillStyle = 'rgba(255,255,255,0.91)';
    ctx.beginPath(); ctx.roundRect(0, 0, width, 62, 12); ctx.fill();
  }
  ctx.font = '500 36px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(text, width / 2, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.position.set(...position); sprite.scale.set(size * width / 62, size, 1); sprite.renderOrder = 10;
  parent.add(sprite);
  return sprite;
}
function surface(fn, name) {
  const N = 60, M = 42, vertices = [], indices = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) vertices.push(...fn(i / N, j / M));
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * (M + 1) + j, b = a + M + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals();
  const singleFluid = ['liquid', 'vapor', 'fluid'].includes(name);
  if (singleFluid) {
    const normals = [], colors = [];
    for (let i = 0; i < vertices.length; i += 3) {
      const t = (2.6 - vertices[i + 2]) / 5, v = xVolume(vertices[i]);
      // Winding of these p,T patches points downward. DoubleSide handles the back.
      normals.push(...fluidNormal(t, v).map(x => -x));
      const r = volumeOrder(v);
      const color = new THREE.Color(COLORS.fluid).lerp(new THREE.Color(r < 0 ? COLORS.liquid : COLORS.vapor), THREE.MathUtils.smoothstep(Math.abs(r), 0, 0.6));
      colors.push(color.r, color.g, color.b);
    }
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  } else if (name === 'lv') {
    // The collapsed critical row contains degenerate triangles; give it the
    // limiting coexistence-plane normal instead of a zero/undefined normal.
    const normal = fluidNormal(CRITICAL_T, CRITICAL_V).map(x => -x);
    const normals = Array.from({ length: vertices.length / 3 }, () => normal).flat();
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: singleFluid ? '#ffffff' : COLORS[name], vertexColors: singleFluid, side: THREE.DoubleSide, roughness: 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  mesh.userData.phase = name;
  mesh.userData.rows = N; mesh.userData.columns = M;
  model.add(mesh); meshes.push(mesh);
  // Parametric guide lines, not additional thermodynamic phase boundaries.
  for (let i = 0; i <= 8; i++) {
    const a = [], b = [];
    for (let j = 0; j <= 80; j++) { a.push(fn(i / 8, j / 80)); b.push(fn(j / 80, i / 8)); }
    line(a, '#334e61', guides, 0.16);
    // Tc is a plotting split, not a phase boundary. Do not draw a seam there.
    if (!singleFluid || !b.every(p => Math.abs(p[2] - temperatureZ(CRITICAL_T)) < 1e-8)) line(b, '#334e61', guides, 0.12);
  }
}
function buildAxes() {
  const origin = [-3, 0, 2.6];
  const endpoints = [[3.3, 0, 2.6], [-3, 5.45, 2.6], [-3, 0, -3.2]];
  endpoints.forEach(p => {
    const dir = new THREE.Vector3(...p).sub(new THREE.Vector3(...origin));
    axes.add(new THREE.ArrowHelper(dir.clone().normalize(), new THREE.Vector3(...origin), dir.length(), 0x79909f, 0.15, 0.075));
  });
  for (let i = 0; i <= 6; i++) {
    const x = -3 + i, z = 2.6 - i * 0.9;
    line([[x, 0, 2.6], [x, 0, -2.8]], '#879aab', axes, 0.13);
    line([[-3, 0, z], [3, 0, z]], '#879aab', axes, 0.13);
  }
}
function buildAxisLabels() {
  clear(axisLabels);
  if (currentView !== 'pt') label('Specific volume, v →', [0.4, -0.35, 3.18], axisLabels, { size: 0.32, background: false });
  if (currentView !== 'tv') label('Pressure, p', [-3.05, 5.75, 2.6], axisLabels, { size: 0.33, background: false });
  if (currentView !== 'pv') {
    const position = currentView === 'pt' ? [-3.45, -0.35, -0.1] : [-3.55, -0.25, -1.1];
    label(currentView === 'tv' ? 'Temperature, T ↑' : 'Temperature, T →', position, axisLabels, { size: 0.32, background: false });
  }
}
function updateLabelVisibility() {
  const all = $('show-all-labels').checked;
  labels.visible = boundaryLabels.visible = all && $('show-labels').checked;
  axisLabels.visible = sliceLabels.visible = all;
  $('phase-legend').hidden = $('boundary-key').hidden = !all;
  $('show-labels').disabled = !all;
  $('chart-labels')?.setAttribute('visibility', all ? 'visible' : 'hidden');
}
function sample(fn, n = 100) { return Array.from({ length: n + 1 }, (_, i) => fn(i / n)); }
function buildModel() {
  clear(model); clear(guides); clear(labels); clear(boundaryLabels); meshes = [];
  for (const patch of patches(water)) surface(patch.fn, patch.name);
  line(sample(u => {
    const t = coexistenceT(u);
    return point(saturatedLiquidV(t), saturationP(t), t);
  }), '#a62e99', model, 1, 0.023);
  line(sample(u => {
    const t = coexistenceT(u);
    return point(saturatedVaporV(t), saturationP(t), t);
  }), '#dc547b', model, 1, 0.023);
  line(tripleVolumeRange(water).map(v => point(v, TRIPLE_P, TRIPLE_T)), '#228b68', model, 1, 0.026);
  const critical = point(CRITICAL_V, CRITICAL_P, CRITICAL_T);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), new THREE.MeshBasicMaterial({ color: '#f0c743' }));
  dot.name = 'critical-point'; dot.position.set(...critical); model.add(dot);
  label('Critical point', [critical[0] + 0.4, critical[1] + 0.32, critical[2]], boundaryLabels, { size: 0.28, color: '#876c1e' });
  const triple = point(2.4, TRIPLE_P, TRIPLE_T);
  label('Triple line', [triple[0], triple[1] - 0.3, triple[2] + 0.18], boundaryLabels, { size: 0.27, color: '#228b68' });
  const satL = point(saturatedLiquidV(0.53), saturationP(0.53), 0.53);
  label('Saturated liquid', [satL[0] - 0.25, satL[1] + 0.2, satL[2]], boundaryLabels, { size: 0.24, color: '#a62e99' });
  const satV = point(saturatedVaporV(0.48), saturationP(0.48), 0.48);
  label('Saturated vapor', [satV[0] + 0.5, satV[1] + 0.2, satV[2]], boundaryLabels, { size: 0.24, color: '#c24469' });
  label('SOLID', point(solidV(0.1, 0.83, water), 0.83, 0.1), labels);
  label('LIQUID', point(liquidV(0.5, 0.88), 0.88, 0.5), labels);
  label('VAPOR', point(vaporV(0.43, 0.075), 0.075, 0.43), labels);
  label('LIQUID + VAPOR', point((saturatedLiquidV(0.44) + saturatedVaporV(0.44)) / 2, saturationP(0.44), 0.44), labels, { size: 0.25, color: '#7c6528' });
  const smP = 0.70, smT = meltingT(smP, water);
  label('SOLID + LIQUID', point((solidV(smT, smP, water) + liquidV(smT, smP)) / 2, smP, smT), labels, { size: 0.23, color: '#615077' });
  label('SOLID + VAPOR', point(2.4, 0.07, 0.11), labels, { size: 0.24, color: '#596f78' });
  label('SUPERCRITICAL', point(fluidV(0.93, 0.87), 0.87, 0.93), labels, { size: 0.23, color: '#397f78' });
  updateSlice();
}
function updateSlice() {
  const isobar = sliceMode === 'pressure';
  const value = Number($(sliceMode).value);
  const axis = isobar ? 'y' : 'z';
  const plane = isobar ? pressureY(value) : temperatureZ(value);
  clear(slice); clear(sliceLabels);
  const segments = [];
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
    for (let i = 0; i < index.count; i += 3) {
      const vertices = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(pos, index.getX(i + j)));
      const hits = [], epsilon = 1e-6;
      const add = p => { if (!hits.some(q => q.distanceToSquared(p) < 1e-12)) hits.push(p.clone()); };
      for (let j = 0; j < 3; j++) {
        const a = vertices[j], b = vertices[(j + 1) % 3], da = a[axis] - plane, db = b[axis] - plane;
        if (Math.abs(da) < epsilon) add(a);
        if (Math.abs(db) < epsilon) add(b);
        if (da * db < 0 && Math.abs(da) >= epsilon && Math.abs(db) >= epsilon) add(a.clone().lerp(b, da / (da - db)));
      }
      if (hits.length >= 2) {
        let a = hits[0], b = hits[1];
        for (const p of hits) for (const q of hits) if (p.distanceToSquared(q) > a.distanceToSquared(b)) { a = p; b = q; }
        if (a.distanceToSquared(b) > 1e-12) segments.push({ a, b, name: mesh.userData.phase });
      }
    }
  }
  if ($('show-slice').checked) {
    const geo = new THREE.BufferGeometry().setFromPoints(segments.flatMap(s => [s.a, s.b]));
    const material = new THREE.LineBasicMaterial({ color: '#163e4a', depthTest: false });
    const curve = new THREE.LineSegments(geo, material); curve.renderOrder = 8; slice.add(curve);
    const y = isobar ? plane : 0.012, z = isobar ? 2.6 : plane;
    line([[-3, y, z], [3.0, y, z]], '#318b76', slice, 0.7);
    label(isobar ? 'p slice' : 'T slice', [-2.8, y + 0.14, z], sliceLabels, { size: 0.23, color: '#267562' });
  }
  // Only the selected plane is rendered. Both insets use its actual mesh section.
  sectionDiagnostics = {
    mode: sliceMode, axis, value, plane, segmentCount: segments.length,
    phases: [...new Set(segments.map(s => s.name))],
    maxPlaneError: segments.reduce((error, s) => Math.max(error, Math.abs(s.a[axis] - plane), Math.abs(s.b[axis] - plane)), 0),
    plateauSpread: (() => {
      const lv = segments.filter(s => s.name === 'lv').flatMap(s => [s.a, s.b]);
      const heights = lv.map(p => isobar ? (2.6 - p.z) / 5 : p.y / 4.5);
      return heights.length ? Math.max(...heights) - Math.min(...heights) : 0;
    })(),
  };
  const sx = x => 33 + (x + 3) / 6 * 229;
  const sy = y => 131 - y / (isobar ? MAX_T : MAX_P) * 116;
  const ordinate = p => isobar ? (2.6 - p.z) / 5 : p.y / 4.5;
  let svg = '<rect x="0" y="0" width="280" height="165" rx="8" fill="#f7f9fa"/><path d="M33 14V131H263" fill="none" stroke="#a9b9c2" stroke-width="1"/>';
  for (const level of (isobar ? [TRIPLE_T, CRITICAL_T] : [TRIPLE_P, CRITICAL_P])) svg += `<path d="M33 ${sy(level)}H262" stroke="#dce4e9" stroke-dasharray="3 4"/>`;
  const paths = {};
  for (const s of segments) {
    paths[s.name] = (paths[s.name] || '') + `M${sx(s.a.x).toFixed(2)},${sy(ordinate(s.a)).toFixed(2)}L${sx(s.b.x).toFixed(2)},${sy(ordinate(s.b)).toFixed(2)}`;
  }
  for (const [name, path] of Object.entries(paths)) svg += `<path d="${path}" fill="none" stroke="${COLORS[name]}" stroke-width="3" stroke-linecap="round"/>`;
  svg += `<g id="chart-labels" fill="#738b98" font-family="sans-serif" font-size="9"><text x="12" y="22" font-style="italic">${isobar ? 'T' : 'p'}</text><text x="250" y="148" font-style="italic">v →</text><text x="34" y="155">Constant ${isobar ? 'p' : 'T'}</text></g>`;
  $('slice-chart').innerHTML = svg;
  $('slice-chart').setAttribute('aria-label', isobar ? 'Temperature–specific volume cross-section at the selected pressure' : 'Pressure–specific volume cross-section at the selected temperature');
  updateLabelVisibility();
  const triple = isobar ? TRIPLE_P : TRIPLE_T, critical = isobar ? CRITICAL_P : CRITICAL_T;
  const atTriple = Math.abs(value - triple) < 1e-6, atCritical = Math.abs(value - critical) < 1e-6;
  const symbol = isobar ? 'p' : 'T', quantity = isobar ? 'pressure' : 'temperature';
  $(`${sliceMode}-label`).textContent = atTriple ? `Triple ${quantity}, ${symbol}ₜᵣ` : atCritical ? `Critical ${quantity}, ${symbol}꜀` : value < triple ? `Below ${symbol}ₜᵣ` : value < critical ? `Between ${symbol}ₜᵣ and ${symbol}꜀` : `Above ${symbol}꜀`;
  if (isobar) {
    $('slice-description').textContent = atTriple ? 'At the triple pressure, solid, liquid, and vapor can coexist at the triple temperature.' : atCritical ? 'At the critical pressure, the liquid–vapor plateau collapses to the critical point.' : value < triple ? 'A solid–vapor plateau: sublimation or deposition at constant temperature.' : value < critical ? 'The flat liquid–vapor segment is boiling or condensation at constant saturation temperature.' : 'No liquid–vapor plateau. Heating connects liquid-like and gas-like fluid continuously.';
  } else {
    $('slice-description').textContent = atTriple ? 'At the triple line, solid, liquid, and vapor can coexist at the same p and T.' : atCritical ? 'The liquid–vapor plateau shrinks to the critical point; its two end states coincide.' : value < triple ? (water ? 'Solid–vapor coexistence at low pressure; this water-like model also permits pressure-induced melting.' : 'A solid–vapor plateau: sublimation or deposition at constant pressure.') : value < critical ? 'The flat liquid–vapor segment is a mixture: volume changes at constant saturation pressure.' : 'No liquid–vapor plateau. The fluid changes continuously; only p > p꜀ is supercritical.';
  }
}
function setSliceMode(mode) {
  sliceMode = mode;
  const isobar = mode === 'pressure';
  $('temperature-controls').hidden = isobar;
  $('pressure-controls').hidden = !isobar;
  for (const [id, selected] of [['isotherm', !isobar], ['isobar', isobar]]) {
    $(id).classList.toggle('selected', selected);
    $(id).setAttribute('aria-pressed', String(selected));
  }
  updateSlice();
}
function setBehavior(value) {
  water = value;
  $('normal').classList.toggle('selected', !water); $('water').classList.toggle('selected', water);
  $('normal').setAttribute('aria-pressed', String(!water)); $('water').setAttribute('aria-pressed', String(water));
  $('behavior-description').innerHTML = water ? 'Contracts on melting: the solid has a <strong>larger</strong> specific volume than the liquid.' : 'Expands on melting: the solid has a <strong>smaller</strong> specific volume than the liquid.';
  $('slope-note').textContent = `${water ? 'Negative' : 'Positive'} solid–liquid slope in p–T space.`;
  $('behavior-caption').textContent = `Solid occupies ${water ? 'more' : 'less'} volume than liquid`;
  buildModel();
}
function view(name) {
  currentView = name;
  controls.dispose();
  camera.up.set(0, name === 'tv' ? 0 : 1, name === 'tv' ? -1 : 0);
  camera.zoom = 1; camera.updateProjectionMatrix();
  if (name === 'pv') { camera.position.set(0, 2.0, 17); }
  else if (name === 'pt') { camera.position.set(17, 2.0, 0); }
  else if (name === 'tv') { camera.position.set(0, 17, 0); }
  else camera.position.set(10.8, 8.5, 12.5);
  // OrbitControls caches the camera-up basis at construction. Refresh it for
  // the top-down projection, and clear residual damping when switching views.
  controls = createControls();
  controls.target.set(0, name === 'tv' ? 0 : 2.0, 0);
  controls.update();
  buildAxisLabels(); updateLabelVisibility();
}
$('normal').onclick = () => setBehavior(false);
$('water').onclick = () => setBehavior(true);
$('temperature').oninput = $('pressure').oninput = updateSlice;
$('isotherm').onclick = () => setSliceMode('temperature');
$('isobar').onclick = () => setSliceMode('pressure');
$('show-slice').onchange = updateSlice;
$('show-all-labels').onchange = updateLabelVisibility;
$('show-labels').onchange = updateLabelVisibility;
$('show-grid').onchange = () => { guides.visible = $('show-grid').checked; };
for (const button of document.querySelectorAll('[data-temp]')) button.onclick = () => { $('temperature').value = button.dataset.temp; updateSlice(); };
for (const button of document.querySelectorAll('[data-pressure]')) button.onclick = () => { $('pressure').value = button.dataset.pressure; updateSlice(); };
for (const name of ['home', 'pv', 'pt', 'tv']) $(name).onclick = () => view(name);
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector('.viewport').requestFullscreen();
  } catch { /* Fullscreen is optional in embedded or restricted browsers. */ }
};
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });
new ResizeObserver(() => {
  const { width, height } = container.getBoundingClientRect();
  const halfHeight = width < 500 ? 5.0 : 4.2;
  camera.left = -halfHeight * width / height; camera.right = halfHeight * width / height;
  camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.updateProjectionMatrix(); renderer.setSize(width, height);
}).observe(container);
buildAxes(); buildModel(); view('home');
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
// Read-only checks of the actual rendered buffers, not just the analytical model.
function geometryDiagnostics() {
  const at = (mesh, i, j, attribute = 'position') => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes[attribute], i * (mesh.userData.columns + 1) + j);
  let maxFluidGap = 0, maxNormalGap = 0, maxColorGap = 0, maxSaturationGap = 0;
  for (const [below, above] of [[4, 6], [5, 7], [3, 8]]) {
    const a = meshes[below], b = meshes[above];
    for (let i = 0; i <= a.userData.rows; i++) {
      maxFluidGap = Math.max(maxFluidGap, at(a, i, a.userData.columns).distanceTo(at(b, i, 0)));
      maxNormalGap = Math.max(maxNormalGap, at(a, i, a.userData.columns, 'normal').distanceTo(at(b, i, 0, 'normal')));
      maxColorGap = Math.max(maxColorGap, at(a, i, a.userData.columns, 'color').distanceTo(at(b, i, 0, 'color')));
    }
  }
  const dome = meshes[9];
  for (let i = 0; i <= dome.userData.rows; i++) {
    maxSaturationGap = Math.max(maxSaturationGap,
      at(meshes[2], i, meshes[2].userData.columns).distanceTo(at(dome, i, 0)),
      at(meshes[5], i, 0).distanceTo(at(dome, i, dome.userData.columns)));
  }
  const marker = model.getObjectByName('critical-point').position;
  const criticalVertices = [at(meshes[3], 0, meshes[3].userData.columns), at(meshes[5], meshes[5].userData.rows, meshes[5].userData.columns), at(meshes[7], meshes[7].userData.rows, 0), at(meshes[8], 0, 0), at(dome, dome.userData.rows, 0)];
  const criticalNormal = at(meshes[8], 0, 0, 'normal');
  let criticalNormalGap = 0;
  for (let j = 0; j <= dome.userData.columns; j++) criticalNormalGap = Math.max(criticalNormalGap, criticalNormal.distanceTo(at(dome, dome.userData.rows, j, 'normal')));
  return { maxFluidGap, maxNormalGap, maxColorGap, maxSaturationGap, criticalNormalGap, criticalVertexError: Math.max(...criticalVertices.map(v => v.distanceTo(marker))) };
}
window.phaseDiagram = {
  get state() { return { water, temperature: Number($('temperature').value), pressure: Number($('pressure').value), sliceMode, surfaces: meshes.length, labels: labels.visible, allLabels: $('show-all-labels').checked, guides: guides.visible, view: currentView }; },
  get section() { return { ...sectionDiagnostics, visibleSlices: slice.children.filter(o => o.isLineSegments).length }; },
  get labelVisibility() { return { phase: labels.visible, boundary: boundaryLabels.visible, axes: axisLabels.visible, slice: sliceLabels.visible && sliceLabels.children.length > 0, inset: $('chart-labels')?.getAttribute('visibility') !== 'hidden', legend: !$('phase-legend').hidden, boundaryKey: !$('boundary-key').hidden }; },
  get continuity() { return geometryDiagnostics(); },
};
