// Headless logic/geometry checks only: renderer and DOM are deliberately mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as THREE from './vendor/three.module.js';
import * as model from './model.mjs';

async function loadApp() {
  const ctx2d = { measureText: text => ({ width: text.length * 18 }), beginPath() {}, roundRect() {}, fill() {}, fillText() {} };
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, value: '', checked: true, hidden: true, innerHTML: '', textContent: '', dataset: {}, attributes: {}, classList: { toggle() {} }, appendChild() {}, setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k] ?? null; }, getBoundingClientRect: () => ({ width: 900, height: 600 }) });
    return elements.get(id);
  }
  element('temperature').value = '0.48';
  element('pressure').value = '0.42';
  element('temperature-controls').hidden = false;
  const temps = ['0.25', '0.76'].map(temp => ({ dataset: { temp } }));
  const pressures = ['0.18', '0.65'].map(pressure => ({ dataset: { pressure } }));
  const doc = {
    getElementById: element, createElement: () => ({ getContext: () => ctx2d }),
    querySelectorAll: selector => selector === '[data-pressure]' ? pressures : temps, querySelector: () => ({ requestFullscreen: async () => { doc.fullscreenElement = true; } }),
    addEventListener() {}, exitFullscreen: async () => { doc.fullscreenElement = null; },
  };
  const window = {};
  const context = vm.createContext({ document: doc, window, devicePixelRatio: 1, console,
    ResizeObserver: class { constructor(fn) { this.fn = fn; } observe() { this.fn(); } },
  });
  let camera;
  class Camera extends THREE.OrthographicCamera { constructor(...args) { super(...args); camera = this; } }
  class Renderer { domElement = {}; setPixelRatio() {} setSize() {} setAnimationLoop() {} }
  class Controls {
    target = new THREE.Vector3();
    constructor(camera) { this.camera = camera; }
    update() { this.camera.lookAt(this.target); this.camera.updateMatrixWorld(); }
    dispose() {}
  }
  function synthetic(exports) {
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [k, v] of Object.entries(exports)) this.setExport(k, v); }, { context });
  }
  const dependencies = { three: synthetic({ ...THREE, WebGLRenderer: Renderer, OrthographicCamera: Camera }), './model.mjs': synthetic(model), './vendor/OrbitControls.js': synthetic({ OrbitControls: Controls }) };
  const app = new vm.SourceTextModule(await readFile(new URL('./app.js', import.meta.url), 'utf8'), { context });
  await app.link(id => dependencies[id]); await app.evaluate();
  return { element, window, temps, pressures, camera };
}

test('app initializes, switches freezing behavior, slices, and handles controls', async () => {
  const { element: el, window, temps } = await loadApp();
  assert.equal(window.phaseDiagram.state.surfaces, 12);
  for (const [name, error] of Object.entries(window.phaseDiagram.continuity)) assert.ok(error < 1e-6, `${name}: ${error}`);
  assert.equal(window.phaseDiagram.state.water, false);
  assert.ok(el('slice-chart').innerHTML.includes(model.COLORS.lv));
  assert.ok(!el('slice-chart').innerHTML.includes('NaN'));
  el('water').onclick();
  assert.equal(window.phaseDiagram.state.water, true);
  assert.ok(el('slope-note').textContent.includes('Negative'));
  assert.equal(el('water').attributes['aria-pressed'], 'true');
  el('normal').onclick();
  assert.equal(window.phaseDiagram.state.water, false);
  for (const t of ['0.06', '0.25', '0.48', '0.76', '1.03']) {
    el('temperature').value = t; el('temperature').oninput();
    assert.ok(el('slice-chart').innerHTML.includes('<path'));
    assert.ok(!el('slice-chart').innerHTML.includes('NaN'));
    assert.ok(el('slice-description').textContent.length > 20);
    if (+t > model.CRITICAL_T) assert.ok(!el('slice-chart').innerHTML.includes(model.COLORS.lv));
    if (+t === model.TRIPLE_T) assert.ok(el('slice-chart').innerHTML.includes(model.COLORS.lv), 'triple-temperature plateau is retained');
  }
  temps[0].onclick(); assert.equal(+el('temperature').value, 0.25);
  temps[1].onclick(); assert.equal(+el('temperature').value, 0.76);
  el('show-labels').checked = false; el('show-labels').onchange();
  el('show-grid').checked = false; el('show-grid').onchange();
  el('water').onclick();
  assert.equal(window.phaseDiagram.state.labels, false);
  assert.equal(window.phaseDiagram.state.guides, false);
  el('show-slice').checked = false; el('show-slice').onchange();
  for (const id of ['home', 'pv', 'pt', 'tv']) assert.doesNotThrow(() => el(id).onclick());
  await el('fullscreen').onclick();
  await el('fullscreen').onclick();
  for (let i = 0; i < 4; i++) { el('normal').onclick(); el('water').onclick(); }
  assert.equal(window.phaseDiagram.state.surfaces, 12);
  for (const [name, error] of Object.entries(window.phaseDiagram.continuity)) assert.ok(error < 1e-6, `${name}: ${error}`);
});

test('T–v projection looks down pressure with volume rightward and temperature upward', async () => {
  const { element: el, window, camera } = await loadApp();
  el('tv').onclick();
  assert.equal(window.phaseDiagram.state.view, 'tv');
  assert.deepEqual(camera.position.toArray(), [0, 17, 0]);
  assert.deepEqual(camera.up.toArray(), [0, 0, -1]);
  const origin = new THREE.Vector3(0, 0, 0).project(camera);
  const volume = new THREE.Vector3(1, 0, 0).project(camera);
  const temperature = new THREE.Vector3(0, 0, -1).project(camera);
  const pressure = new THREE.Vector3(0, 1, 0).project(camera);
  assert.ok(volume.x > origin.x);
  assert.ok(temperature.y > origin.y);
  assert.ok(Math.abs(pressure.x - origin.x) < 1e-10 && Math.abs(pressure.y - origin.y) < 1e-10);
  for (const id of ['pv', 'pt', 'home']) {
    el(id).onclick();
    assert.deepEqual(camera.up.toArray(), [0, 1, 0]);
    assert.equal(window.phaseDiagram.state.view, id);
  }
});

test('master label toggle hides every diagram label and persists across rebuilds', async () => {
  const { element: el, window } = await loadApp();
  const assertAllHidden = () => {
    assert.equal(window.phaseDiagram.state.allLabels, false);
    for (const [name, visible] of Object.entries(window.phaseDiagram.labelVisibility)) assert.equal(visible, false, name);
    assert.equal(el('show-labels').disabled, true);
  };
  el('show-all-labels').checked = false; el('show-all-labels').onchange();
  assertAllHidden();
  el('water').onclick(); assertAllHidden();
  el('temperature').value = '0.7'; el('temperature').oninput(); assertAllHidden();
  el('show-slice').checked = false; el('show-slice').onchange();
  el('show-slice').checked = true; el('show-slice').onchange(); assertAllHidden();
  el('tv').onclick(); assertAllHidden();
  el('home').onclick(); assertAllHidden();
  el('show-all-labels').checked = true; el('show-all-labels').onchange();
  for (const [name, visible] of Object.entries(window.phaseDiagram.labelVisibility)) assert.equal(visible, true, name);
  assert.equal(el('show-labels').disabled, false);
  el('show-labels').checked = false; el('show-labels').onchange();
  el('show-all-labels').checked = false; el('show-all-labels').onchange();
  el('show-all-labels').checked = true; el('show-all-labels').onchange();
  assert.equal(window.phaseDiagram.labelVisibility.phase, false, 'phase-label preference is preserved');
  assert.equal(window.phaseDiagram.labelVisibility.axes, true);
});

test('section modes are mutually exclusive and preserve independent slider values', async () => {
  const { element: el, window, pressures } = await loadApp();
  assert.equal(window.phaseDiagram.state.sliceMode, 'temperature');
  assert.equal(el('temperature-controls').hidden, false);
  assert.equal(el('pressure-controls').hidden, true);
  el('temperature').value = '0.7'; el('temperature').oninput();
  el('isobar').onclick();
  assert.equal(window.phaseDiagram.state.sliceMode, 'pressure');
  assert.equal(el('temperature-controls').hidden, true);
  assert.equal(el('pressure-controls').hidden, false);
  assert.equal(el('isobar').attributes['aria-pressed'], 'true');
  assert.equal(el('isotherm').attributes['aria-pressed'], 'false');
  assert.ok(el('slice-chart').innerHTML.includes('Constant p'));
  assert.ok(!el('slice-chart').innerHTML.includes('Constant T'));
  assert.ok(el('slice-chart').attributes['aria-label'].startsWith('Temperature–'));
  assert.equal(window.phaseDiagram.section.visibleSlices, 1);
  pressures[0].onclick(); assert.equal(window.phaseDiagram.state.pressure, model.TRIPLE_P);
  pressures[1].onclick(); assert.equal(window.phaseDiagram.state.pressure, model.CRITICAL_P);
  el('pressure').value = '0.8'; el('pressure').oninput();
  el('isotherm').onclick();
  assert.equal(window.phaseDiagram.state.temperature, 0.7);
  assert.equal(window.phaseDiagram.section.axis, 'z');
  assert.equal(window.phaseDiagram.section.visibleSlices, 1);
  assert.ok(el('slice-chart').innerHTML.includes('Constant T'));
  el('isobar').onclick();
  assert.equal(window.phaseDiagram.state.pressure, 0.8);
  assert.equal(window.phaseDiagram.section.axis, 'y');
  el('show-slice').checked = false; el('show-slice').onchange();
  assert.equal(window.phaseDiagram.section.visibleSlices, 0);
  el('isotherm').onclick(); assert.equal(window.phaseDiagram.section.visibleSlices, 0);
});

test('isobars use the constant-pressure plane and T–v plateau in both freezing modes', async () => {
  const { element: el, window } = await loadApp();
  el('isobar').onclick();
  for (const substance of ['normal', 'water']) {
    el(substance).onclick();
    for (const p of [0.035, 0.08, model.TRIPLE_P, 0.42, 0.64, model.CRITICAL_P, 0.66, 0.9, 1.12]) {
      el('pressure').value = String(p); el('pressure').oninput();
      const section = window.phaseDiagram.section;
      assert.equal(section.mode, 'pressure');
      assert.equal(section.axis, 'y');
      assert.equal(section.value, p);
      assert.ok(Math.abs(section.plane - model.pressureY(p)) < 1e-9);
      assert.ok(section.segmentCount > 0);
      assert.ok(section.maxPlaneError < 1e-6);
      assert.ok(section.plateauSpread < 1e-6, 'constant-pressure boiling remains isothermal');
      assert.equal(section.visibleSlices, 1);
      assert.ok(!/NaN|Infinity/.test(el('slice-chart').innerHTML));
      if (p > model.TRIPLE_P && p < model.CRITICAL_P) assert.ok(section.phases.includes('lv'));
      if (p > model.CRITICAL_P) assert.ok(!section.phases.includes('lv'));
    }
  }
  el('show-all-labels').checked = false; el('show-all-labels').onchange();
  el('isotherm').onclick(); el('isobar').onclick(); el('normal').onclick();
  for (const [name, visible] of Object.entries(window.phaseDiagram.labelVisibility)) assert.equal(visible, false, name);
});

test('page contains the new controls without presentation disclaimers', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="tv"'));
  assert.ok(html.includes('id="show-all-labels"'));
  for (const text of ['not property data', 'not to scale', 'not an equation of state', 'full phase diagram']) assert.ok(!html.includes(text), text);
  const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  assert.ok(!app.includes('compressed volume scale'));
});

test('standalone project has author attribution, repository link, and root-relative commands', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const readme = await readFile(new URL('./README.md', import.meta.url), 'utf8');
  const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
  assert.ok(html.includes('© 2026 Chuanjin Su'));
  assert.ok(html.includes('href="https://github.com/chuanjin-su/pvt-diagram-3d"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.equal(pkg.name, 'pvt-diagram-3d');
  assert.equal(pkg.author, 'Chuanjin Su');
  assert.equal(pkg.scripts.start, 'python3 -m http.server 8000');
  assert.ok(html.includes('python3 -m http.server 8000 from the project root'));
  assert.ok(readme.includes('python3 -m http.server 8000\n'));
  assert.ok(readme.includes('node --test model.test.mjs'));
  assert.ok(readme.includes('node --experimental-vm-modules --test ui.test.mjs'));
});
