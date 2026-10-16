# Phase Space — 3D p–v–T phase surfaces

An interactive thermodynamics teaching model by **Chuanjin Su**.

[GitHub repository](https://github.com/chuanjin-su/pvt-diagram-3d)

## Open in a browser

Clone the repository and serve its root:

```sh
git clone git@github.com:chuanjin-su/pvt-diagram-3d.git
cd pvt-diagram-3d
python3 -m http.server 8000
```

Open **http://localhost:8000**. Stop the server with Ctrl+C.

Use an HTTP server, not a double-click on `index.html`: browser security blocks local ES module imports under `file://`.

No build, npm install, account, or internet connection is needed. Three.js 0.160.1 and OrbitControls are included locally in `vendor/`, with their MIT license. A modern browser with WebGL is required. The folder can also be published unchanged to any static website host.

## Teaching controls

- Drag to rotate; scroll/pinch to zoom; right-drag/two-finger drag to pan.
- **Most substances / Water-like** changes the solid–liquid volume ordering and the sign of the melting slope. These are two schematic behaviors, not particular substances.
- Section **02** switches between **Isotherm · constant T** and **Isobar · constant p**. Only one section, slider, and inset is displayed at a time. Each mode remembers its slider value.
- The **temperature slider** draws an isotherm and its matching p–v curve; **Tₜᵣ / T꜀** jump to the triple/critical temperatures. The **pressure slider** draws an isobar and its matching T–v curve; **pₜᵣ / p꜀** jump to the triple/critical pressures. The shared **Show slice** checkbox controls the active 3D section.
- **p–v / p–T / T–v view** are orthographic projections. The T–v view looks along the pressure axis, with volume increasing rightward and temperature upward. Reset returns to the three-dimensional view.
- **All diagram labels** hides phase names, boundary annotations, axis names, the slice tag, inset text, and legends. The controls stay available. The separate **Phase & boundary labels** preference is preserved when the master toggle is switched off and back on.
- Hide guide lines for a cleaner view. Full screen is useful for lectures.

## Scope and scientific conventions

This is deliberately a **qualitative equilibrium surface**, not an equation of state or a source of numerical property values. All coordinates are dimensionless. Specific volume uses a compressed, logarithmic display scale; distances and slopes in p–v space are not quantitative. The p–v inset uses the same scale.

The model includes solid, liquid, vapor, continuous high-temperature fluid, and solid–liquid / solid–vapor / liquid–vapor coexistence patches. The labeled saturated-liquid and saturated-vapor curves meet at the critical point.

Liquid, vapor, and high-temperature fluid are derived from **one shared smooth cubic relation** in a logarithmic volume coordinate, not independently fitted surfaces. Only its outer stable branches are drawn below the critical temperature; a flat coexistence patch replaces the middle. The critical isotherm has a horizontal inflection. Shared vertices, analytical normals, and continuous colors prevent an artificial geometric or lighting seam at T꜀. Colors blend across the critical region; that blend is not a phase boundary.

At the triple line, pressure and temperature are fixed and mixture volume varies. The supercritical label refers only to the region above **both** critical pressure and critical temperature; the high-temperature sheet also extends to lower, gas-like pressures.

The two freezing behaviors satisfy the qualitative Clapeyron sign relation, assuming positive entropy of melting. The water-like mode is **not** a model of ice polymorphs or the full phase diagram of water. The finite surface ends are plot limits, not phase boundaries. Surface guide lines are mesh guides, not additional coexistence lines. There is no metastable van der Waals loop.

Geometry is in `model.mjs`; rendering and controls are in `app.js`; appearance is in `style.css`.

## Checks

With Node.js 20+:

```sh
npm test
# Or run the two suites directly:
node --test model.test.mjs
node --experimental-vm-modules --test ui.test.mjs
```

The UI checks exercise real Three.js geometry and DOM event handlers with a mocked canvas/renderer. They check the actual mesh buffers for matching positions, normals, colors, saturation edges, and critical-point placement. They do **not** replace a real WebGL browser check.

For a live browser check, `window.phaseDiagram.continuity` exposes read-only maximum seam errors in the rendered buffers. Position/normal/color seam errors should be zero or within floating-point precision; `criticalVertexError` should be below 1e-6.

## Copyright and third-party software

Copyright © 2026 Chuanjin Su.

The bundled Three.js and OrbitControls files retain their original MIT license in [`vendor/THREE-LICENSE.txt`](vendor/THREE-LICENSE.txt). See [`NOTICE`](NOTICE) for attribution.
