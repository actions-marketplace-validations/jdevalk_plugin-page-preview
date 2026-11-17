# Plugin Page Preview

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Plugin authors checking their WordPress.org listing before submitting a release.

## Product Purpose
A reusable standalone tool that previews plugin readme.txt or README.md files and flags parsing warnings.

## Operating Context
Local plugin checkouts, readme.txt with README.md fallback, plugin PHP headers, and .wordpress-org or SVN assets folders.

## Capabilities and Constraints
Use the upstream WordPress.org parser. Preview description, FAQ, installation, changelog, banners, icons and screenshots. Edits are temporary until downloaded. No WordPress installation or database required. No invented ratings or installation counts. A separate WordPress admin Plugins listing uses the PHP header fields.

## Brand Commitments
The preview should resemble the current WordPress.org plugin page.

## Implementation
The main app runs entirely in the browser, including the upstream PHP parser through WordPress Playground's WebAssembly runtime in a Web Worker. Node.js bundles static files for Cloudflare Workers Static Assets or another static host. No parsing backend, database, or Docker container is needed. Readmes, plugin headers, and images stay on the user's device. Browser-selected folders are snapshots and can be reopened to refresh them. Production is hosted at readme.joost.blog. Public GitHub commit links load readmes and assets directly into the browser; the reusable GitHub Action posts preview links and shared preflight results on plugin pull requests.

## Evidence on Hand
PDF XML Sitemap's local readme and .wordpress-org assets are the first real fixture. WordPress.org's live plugin page is the visual reference.
