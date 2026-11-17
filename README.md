# Plugin Page Preview

Preview a WordPress.org plugin listing before submitting a release. Open a plugin folder, choose a `readme.txt` or `README.md`, or paste one into the editor. PHP runs inside a browser Web Worker using WordPress Playground's WebAssembly runtime. Local files stay on your device. Public GitHub preview links import the selected commit into your browser.

**[Open Plugin Page Preview](https://readme.joost.blog/)** · **[Set up PR comments](docs/github-action.md)**

## Run locally

Build tooling requires Node.js 24.22+ and npm 11.16+, matching the pinned Playground packages. PHP and Docker are not required to build or use the app.

```sh
cd ~/Code/plugin-page-preview
npm ci
npm start
```

Open the printed HTTP URL, normally `http://127.0.0.1:4173`. The Node process only serves static files. It has no upload or parsing API. Use `PORT=4174 npm start` if the port is occupied. To serve an existing build, use `npm run preview`.

Open a plugin with the folder chooser in the browser. Direct `file://` URLs are not supported because browsers restrict module and WebAssembly loading from local files.

You can also paste a public `https://github.com/owner/plugin` repository link into **Open plugin**. This loads the latest commit on the default branch, including the root readme, PHP headers, and listing assets. Private repositories and branch or subfolder URLs are not supported by this field; shared preview links below can target a specific commit and plugin subfolder.

## What you can check

- Plugin page, search-result card, and WordPress admin Plugins listing at desktop and mobile widths.
- Case-insensitive readme selection: `readme.txt` takes precedence over `README.md` in the plugin folder. Downloads preserve the selected filename.
- Description, installation, FAQ, changelog, contributors, and sidebar metadata.
- Banners, icons, and numbered screenshots from `.wordpress-org/` or `assets/`, including sibling SVN assets for `trunk` and `tags/<version>`.
- Upstream parsing warnings, short-description length and truncation, missing screenshot images, and stable-tag/version mismatches.
- Preflight displays every passing check with a green tick, alongside warning and note counts. Warnings appear first; checks without enough information are never marked as passed.
- Objective checks for missing PHP version/requirement headers, conflicting readme and PHP minimum versions, a tested WordPress branch below the minimum, and changelog release mismatches. Missing or empty Installation, FAQ, Changelog, and Screenshots content produces preflight warnings. These are this tool’s quality checks, not a claim that WordPress.org requires all four sections. Unreleased headings are skipped and unrecognized changelog formats are marked unchecked. These checks do not inspect remote SVN tags.
- A live check against WordPress.org’s stable release API for the `Tested up to` header, comparing major releases such as `7.1` and ignoring patch numbers. Failed lookups show an unchecked status with a retry button.
- Live edits with queued work limited to the newest readme, keeping the editor responsive.

Use **Download readme** to save edits. Original files are never changed. Browser-selected folders are snapshots; select them again after editing files elsewhere. Server path loading and automatic filesystem watching have been removed. Add individual images through **Listing assets**.

## Static hosting and Cloudflare

```sh
npm ci
npm run build
```

Deploy the contents of `dist/` through Cloudflare Workers Static Assets or another static HTTPS host. No backend Worker code is necessary. Production runs at https://readme.joost.blog/ using the configuration in `cloudflare.config.ts`.

To deploy with an authenticated Cloudflare CLI:

```sh
npm run deploy
```

To create a temporary preview of changes to this application, use `npm run deploy:preview -- --preview-name pr-123`. Preview builds exclude the production domain and add `noindex` headers. These app deployments are separate from the plugin-repository preview links below.

The build includes Cloudflare's `_headers` file for CSP, security headers, and caching. Other hosts must apply equivalent HTTP headers. Serve `.wasm` as `application/wasm`; allow `wasm-unsafe-eval` for WebAssembly compilation and same-origin workers. The CSP also permits the public release-version lookup at `https://api.wordpress.org` and public file imports from `api.github.com` and `raw.githubusercontent.com`. The preview iframe separately disallows scripts. `404.html` prevents a generic application fallback from obscuring missing assets.

JavaScript, CSS, PHP source data, and WASM runtime paths are content-versioned for immutable caching. The HTML revalidates so it points to the current assets. Publish the directory atomically and retain older hashed assets during rolling deploys if your host does not preserve previous versions for active sessions. The largest file is approximately 20 MB, below Cloudflare's 25 MiB per-file limit. The runtime and application are approximately 8.2 MB compressed with gzip; actual transfer size depends on host compression. Runtime initialization is lazy, and one runtime is reused within each page session.

## GitHub pull-request previews

The reusable action in this repository comments on plugin pull requests with a preview link, visible preflight warnings, and expandable passing checks. It updates its existing comment when the pull request changes. The action uses the same preflight rules as the browser app.

Copy [the example workflow](docs/plugin-repository-workflow.yml) into the plugin repository's `.github/workflows/readme-preview.yml` on its default branch. See [setup and permissions](docs/github-action.md). No Cloudflare credentials or deployment are required in plugin repositories.

Links accept `repo=owner/repository`, `ref=<full commit SHA>`, and optional `path=<plugin folder>`. Only public repositories are supported. The link always targets the specified revision.

## Privacy and limits

The browser downloads application code and trusted parser dependencies. Plugin contents are passed to the Web Worker and held in its private in-memory filesystem, never sent to a parsing endpoint. There is no telemetry or cloud storage. The browser makes one public version lookup per page session to WordPress.org (plus explicit retries), without plugin data, cookies, or a referrer. Closing the page discards imported content. The browser's normal HTTP cache may retain application code and files fetched from public GitHub URLs. Local files are not uploaded. Shared preview links contact GitHub for repository metadata and the selected commit's readme, PHP headers, and artwork; they do not require sign-in or accept a GitHub token. Clicking an external link in a readme opens that destination normally.

Readmes are limited to 512 KB, images to 8 MB each and 24 MB combined. PHP uses a 128 MB configured memory limit. Startup has a 60-second timeout; parsing has a 10-second timeout. On failure the worker can be restarted with **Retry preview**. Imported PHP files are inspected as text for metadata and are never executed. No WordPress site or database is booted.

## Parsing and fidelity

The app uses the upstream WordPress.org PHP readme parser and its Markdown implementation, plus WordPress 6.9 formatting/KSES and sodium compatibility files. `vendor/sources.json` records source URLs, the WordPress.org commit, and checksums. These vendor files are unmodified. A subclass preserves contributor handles because no WordPress.org account database is available. PHP 8.4.27 runs through the pinned `@php-wasm/web-8-4` and `@php-wasm/universal` 3.1.65 packages, using Asyncify for broader browser support.

The layout approximates WordPress.org. Account verification, repository tag existence, reviews, install counts, update dates, translations, remote embeds, and plugin approval checks are not reproduced. Plugin PHP headers supply version, author, and minimum WordPress/PHP versions when loaded. The admin listing uses PHP header name, description, version, author, and plugin URL, sanitized using the same WordPress KSES allowlist as the Plugins screen. It shows an illustrative active state; site-specific actions, updates, filters, and translations are not reproduced. Editing the readme does not change these PHP fields. Choosing a readme alone cannot supply those headers or listing images.

Readme selection follows [WordPress.org’s importer](https://github.com/WordPress/wordpress.org/blob/0ad2754836c3bdb4b426d43ee91a596c8fc7df94/wordpress.org/public_html/wp-content/plugins/plugin-directory/cli/class-import.php#L1209). Admin header sanitization follows [WordPress 6.9’s plugin metadata handling](https://github.com/WordPress/WordPress/blob/6.9/wp-admin/includes/plugin.php#L158).

## Verification

```sh
npm run build
npm test
```

These tests cover rapid edits and cancellation, worker restart and timeout, file imports, metadata parsing, asset discovery, input limits, and static hosting with no parsing endpoint.

Optional reference tests require native PHP 8.1+ with mbstring and sodium:

```sh
npm run test:reference
```

The browser feasibility harness in `experiments/browser-parser/` compares WebAssembly output with native PHP. Browser QA of the integrated app covers folder import, live warnings, empty input, page/search-card/admin-listing views, Markdown fallback and filename-preserving downloads, mobile width, FAQ/tabs, screenshots, and readme download. Cross-browser coverage remains limited to the browser used for QA; Safari, Firefox, and slow-network behavior need separate validation before claiming universal support.

## Third-party code

Distributed under GPL-2.0-or-later. See `LICENSE`, the vendor licenses, and `dist/licenses/`. PHP Markdown uses its included BSD-style license. The build includes dependency notices and the trusted PHP source bundle. Plugin artwork is loaded from the selected folder, not bundled with the application.
