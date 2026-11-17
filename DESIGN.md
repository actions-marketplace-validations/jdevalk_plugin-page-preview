# Plugin Page Preview design

## Purpose
An operating interface for checking a plugin listing before publication. The WordPress.org approximation is the primary artifact; editor controls sit outside it.

## Layout
Desktop: 76px top bar, 350px editor at left (400px above 1600px; 300px at or below 1100px), flexible preview at right. The iframe is independently scrollable. Mobile: stacked editor and 850px preview region. The preview width switch also supports a 390px phone view on desktop. The plugin Download button occupies its own row on mobile so the title retains readable width.

## Tokens
- App accent: `#3858e9`; primary text: `#20252b`; secondary text: `#606a77`.
- Workspace: `#f0f2f4`; surfaces: white; dividers: `#d9dde3`.
- Successful check: `#226447`; warning: `#855818`; error: `#a22828`.
- Controls: 5px corner radius, 9px by 13px padding; 3px visible focus outline.
- Interface type: system sans; editor: system monospace, 12px / 1.85.
- Heading scale: 16px editor heading, 18px brand, 22px dialog heading, 26px preview plugin title.

## Preview reference
WordPress.org plugin page observed on 2026-11-17: charcoal navigation, white content, wide banner, icon/title row, section tabs, main description column with metadata sidebar. The local renderer approximates this structure and explicitly omits live directory facts. It does not claim pixel parity.

## Behavior and accessibility
Use visible labels, native buttons and dialogs, native FAQ disclosures, keyboard-operable screenshot enlargement, status announcements, and focus indicators. The textarea uses a blue 2px inset focus edge and a pale focused background. Blank input shows a clear starting state. Parser errors preserve the editor. File imports are explicit. Downloads leave original files untouched. No motion is required for completing a task.

The browser runtime loads on the first nonempty readme. Loading and parsing status remains visible at narrow widths; errors provide a Retry preview button. Only the newest queued edit is parsed. The import dialog states that all plugin files remain on the device. Browser folder snapshots replace server paths and filesystem watching.

## Asset provenance
The application ships no raster artwork. Plugin images shown during verification came from the user's PDF XML Sitemap `.wordpress-org` folder and are loaded at runtime only. The small interface icons are authored SVG geometry.
