# Browser PHP feasibility proof

This isolated experiment runs the application's unchanged PHP readme parser in a browser Web Worker, using WordPress Playground's PHP WebAssembly runtime. The main preview app now uses the same browser-only approach. This remains an isolated comparison harness.

## Run

Use Node.js 24.18+ and npm 11.16+ as required by the pinned Playground packages. Python 3 serves the static test files.

```sh
cd experiments/browser-parser
npm ci
npm run build
npm run serve
```

Open `http://127.0.0.1:4180` and click **Run compatibility checks**. Building generates native-PHP reference output; running the page compares the browser PHP output against it. Native PHP is needed only to build this comparison fixture, not to run the browser test.

## Verified result

On 2026-11-17, the Codex in-app browser passed all eight exact output comparisons: 150-character boundary, truncation at 151 characters, Unicode, HTML entities/formatting, unsafe HTML filtering, missing headers, path-like input, and the PDF sitemap plugin readme. The results include descriptions, FAQ, screenshots, installation, changelog, headers, and warnings.

Runtime: PHP 8.4.27 from `@php-wasm/web-8-4@3.1.65`, using its Asyncify build. The universal API package uses the same release. `mbstring` is bundled. Sodium is not, so the shared vendor tree includes WordPress 6.9's official `sodium_compat` fallback; source and hashes are recorded in `sodium-sources.json`. The upstream parser and WordPress files are not modified. The worker supplies stdin/stderr compatibility streams and an in-memory filesystem.

The WASM binary is 19,981,542 bytes, or 7,638,014 bytes compressed with gzip. This is a compressed-size estimate, not a measured internet transfer. Cold-start behavior on slow networks and other browsers has not been tested. The static proof runs with a restrictive CSP allowing WebAssembly compilation, without an upload or parsing endpoint.

## Implications for the application

- A browser-only version can use Cloudflare Workers Static Assets. The largest required file fits Cloudflare's 25 MiB individual-asset limit.
- Readme contents, PHP headers, and images can stay entirely on the user's device.
- A reusable Web Worker keeps parsing off the UI thread; runtime caching and loading/error states need integration.
- Cloud hosting would serve static files only. Docker, a PHP server, and the readme parsing API would no longer be needed for that version.
- Folder imports remain supported. Server-local path loading and automatic filesystem watching would need to remain a local-only feature or be replaced by a separately tested browser filesystem flow.
- Before migration is considered complete, test the integrated editor, repeated edits and cancellation, browser compatibility, and production CSP/caching. This proof is not a deployed application.

References: [Playground package architecture](https://developer.wordpress.org/playground/developers/architecture/php-wasm-packages/) and [Cloudflare asset limits](https://developers.cloudflare.com/workers/platform/limits/).
