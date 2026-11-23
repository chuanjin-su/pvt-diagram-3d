# Phase Space

An interactive 3D pressure–specific volume–temperature (p–v–T) diagram by Chuanjin Su. Compare ordinary and water-like freezing behavior and explore isotherms and isobars.

The model is qualitative and uses dimensionless coordinates with a logarithmic specific-volume scale.

## Run locally

Serve the project root with Python 3.

```sh
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000/) in a browser with WebGL. All runtime assets are bundled.

## Development

Run `npm test` with Node.js 20 or later.

- `index.html` is the static entry point.
- `src/` contains the model, rendering, controls, and styles.
- `tests/` contains the model and UI checks.
- `vendor/` contains the bundled libraries and fonts. See [NOTICE](NOTICE) for attribution.
