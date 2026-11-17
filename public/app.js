import { readPluginFiles } from "./plugin-files.js";
import { BrowserParser } from "./parser-client.js";
import { latestWordPressMajor } from "./wordpress-version.js";
import { collectPreflight } from "./preflight.js";
import { loadGitHubPlugin, parseGitHubSource, resolveGitHubRepository } from "./github-source.js";
const $ = (id) => document.getElementById(id);
const editor = $("readme"),
  frame = $("preview");
const state = {
  headers: {},
  assets: {},
  parsed: null,
  dirty: false,
  view: "page",
  tab: "details",
  sequence: 0,
  filename: "readme.txt",
  wordpress: { status: "idle", major: null },
};
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const decode = (value) => {
  const el = document.createElement("textarea");
  el.innerHTML = String(value ?? "");
  return el.value;
};
const text = (value) => escape(decode(value));
const values = (object) => Object.values(object || {});
const entries = (object) => Object.entries(object || {});
const plain = (html) => {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  return doc.body.textContent;
};
let debounce;

const parser = new BrowserParser({
  onStatus: (message) => {
    if (editor.value.trim()) status(message);
  },
});
function status(message) {
  $("parse-status").textContent = message;
}
function showError(message) {
  status("Preview unavailable");
  $("check-list").replaceChildren();
  const p = document.createElement("p");
  p.className = "error";
  p.textContent = message;
  $("check-list").append(p);
  $("check-count").textContent = "Could not parse";
  const retry = document.createElement("button");
  retry.textContent = "Retry preview";
  retry.addEventListener("click", parse);
  $("check-list").append(retry);
}
function updateEditorState() {
  $("line-count").textContent =
    `${editor.value ? editor.value.split("\n").length : 0} lines`;
  $("edit-state").textContent = state.dirty
    ? "Edited"
    : editor.value
      ? "Loaded"
      : "Ready";
  $("download").disabled = !editor.value.trim();
}
async function parse() {
  const sequence = ++state.sequence;
  updateEditorState();
  if (!editor.value.trim()) {
    parser.cancel();
    state.parsed = null;
    frame.srcdoc = "";
    $("empty-preview").hidden = false;
    $("check-list").innerHTML =
      '<p class="muted">Parsing warnings and missing assets appear here.</p>';
    $("check-count").textContent = "Waiting for a readme";
    status("Open a plugin to begin");
    return;
  }
  if (state.wordpress.status === "idle") refreshWordPressVersion();
  status("Rendering…");
  try {
    const parsed = await parser.parse(editor.value, state.headers);
    if (sequence !== state.sequence) return;
    state.parsed = parsed;
    render();
    renderChecks();
    status("Preview up to date");
  } catch (error) {
    if (error.name !== "AbortError" && sequence === state.sequence)
      showError(error.message);
  }
}
function findAsset(prefix) {
  return Object.keys(state.assets).find(
    (name) => name.replace(/\.(?:png|jpe?g|gif|webp|svg)$/i, "") === prefix,
  );
}
function iconHTML() {
  const name =
    findAsset("icon-256x256") || findAsset("icon-128x128") || findAsset("icon");
  return name
    ? `<img class="icon" src="${escape(state.assets[name])}" alt="Plugin icon">`
    : '<div class="icon icon-placeholder">Plugin icon</div>';
}
function chromeHTML() {
  return '<div class="wpbar"><span class="wpmark" aria-label="WordPress">W</span><span>Plugins</span><span class="optional">Themes</span><span class="optional">Learn</span><span class="right">WordPress.org</span></div><div class="wp-subbar">Plugin Directory</div>';
}
function screenshotHTML() {
  const screenshots = entries(state.parsed.screenshots);
  if (!screenshots.length) return "";
  return `<section><h2>Screenshots</h2><div class="screenshot-grid">${screenshots
    .map(([number, caption]) => {
      const name = findAsset(`screenshot-${number}`);
      return `<figure>${name ? `<img data-asset="${escape(name)}" tabindex="0" role="button" aria-label="Enlarge screenshot ${number}" src="${escape(state.assets[name])}" alt="${escape(plain(caption))}">` : `<div class="missing-image">Missing screenshot-${number}</div>`}<figcaption>${caption}</figcaption></figure>`;
    })
    .join("")}</div></section>`;
}
function faqHTML() {
  const faq = entries(state.parsed.faq);
  const section = state.parsed.sections.faq || "";
  if (!faq.length && !section) return "";
  // The upstream parser sanitizes the complete FAQ section, including question text.
  const doc = new DOMParser().parseFromString(section, "text/html");
  const dl = doc.querySelector("dl");
  let items = "";
  if (dl) {
    for (const dt of dl.querySelectorAll(":scope > dt")) {
      const answer = dt.nextElementSibling;
      items += `<details><summary>${escape(dt.textContent)}</summary><div>${answer?.tagName === "DD" ? answer.innerHTML : ""}</div></details>`;
    }
    dl.remove();
  }
  return `<section class="faq"><h2>FAQ</h2>${doc.body.innerHTML}${items}</section>`;
}
function render() {
  if (!state.parsed) return;
  const p = state.parsed,
    h = state.headers;
  const name = p.name || h["Plugin Name"] || "Untitled plugin";
  const author =
    h.Author || values(p.contributors).join(", ") || "Author not supplied";
  const version = h.Version || p.stable_tag || "Not supplied";
  let body;
  if (state.view === "listing") {
    const admin = p.admin_headers;
    const metadata = [];
    if (admin?.Version) metadata.push(`Version ${admin.Version}`);
    if (admin?.Author)
      metadata.push(
        `By ${admin["Author URI"] ? `<a href="${escape(decode(admin["Author URI"]))}">${admin.Author}</a>` : admin.Author}`,
      );
    if (admin?.["Plugin URI"])
      metadata.push(
        `<a href="${escape(decode(admin["Plugin URI"]))}">Visit plugin site</a>`,
      );
    body = `<div class="admin-preview"><div class="admin-bar"><span class="wpmark" aria-label="WordPress">W</span><span>WordPress admin</span></div><main class="admin-main"><div class="admin-heading"><h1>Plugins</h1><button disabled>Add Plugin</button></div>${admin?.["Plugin Name"] ? `<p class="admin-note">Example active plugin. This listing uses the plugin’s PHP header; editing the readme does not change it. Site-specific links and update notices are not included.</p><p class="admin-filters"><strong>All <span>(1)</span></strong> <span>|</span> <span>Active (1)</span></p><table class="admin-plugins"><thead><tr><td class="admin-check"><input type="checkbox" disabled aria-label="Select all plugins"></td><th scope="col">Plugin</th><th scope="col">Description</th></tr></thead><tbody><tr><th class="admin-check" scope="row"><input type="checkbox" disabled aria-label="Select plugin"></th><td class="admin-plugin-name"><strong>${admin["Plugin Name"]}</strong><div class="admin-row-actions"><button disabled>Deactivate</button></div></td><td class="admin-description"><p>${admin.Description || "&nbsp;"}</p><div class="admin-plugin-meta">${metadata.join(' <span class="admin-separator">|</span> ')}</div></td></tr></tbody></table>` : '<div class="admin-missing"><h2>Open the plugin folder to preview this listing</h2><p>WordPress uses the main PHP file’s plugin header for this screen. A readme alone does not contain these fields.</p></div>'}</main></div>`;
  } else if (state.view === "card") {
    body = `<div class="search-page">${chromeHTML()}<div class="search-intro"><h1>Plugin search result</h1><p>This is where the short description appears, after WordPress.org’s truncation.</p></div><article class="search-card">${iconHTML()}<div><h2>${text(name)}</h2><p>${text(p.short_description)}</p></div><div class="search-meta"><span>By ${escape(author)}</span><span>Tested with ${text(p.tested || "not supplied")}</span><span>Ratings and installs unavailable in preview</span></div></article></div>`;
  } else {
    const banner = findAsset("banner-1544x500") || findAsset("banner-772x250");
    const tabs = [
      ["details", "Details"],
      ["reviews", "Reviews"],
      ["installation", "Installation"],
      ["development", "Development"],
    ];
    const description =
      p.sections.description || "<p>No description supplied.</p>";
    const contributors = `<section><h2>Contributors &amp; Developers</h2><p>“${text(name)}” is open source software. The following people have contributed to this plugin.</p><div class="contributors">${
      values(p.contributors)
        .map((c) => `<span class="contributor">${text(c)}</span>`)
        .join("") || '<span class="quiet">No contributors listed.</span>'
    }</div></section>`;
    const content =
      state.tab === "details"
        ? `<section><h2>Description</h2>${description}</section>${screenshotHTML()}${faqHTML()}${contributors}`
        : state.tab === "installation"
          ? `<section><h2>Installation</h2>${p.sections.installation || '<p class="empty-section">No installation section in this readme.</p>'}</section>`
          : state.tab === "development"
            ? `${contributors}<section><h2>Changelog</h2>${p.sections.changelog || '<p class="empty-section">No changelog section in this readme.</p>'}</section>`
            : '<section><h2>Reviews</h2><p class="empty-section">Reviews come from WordPress.org and are not part of your readme. They are not shown in this preview.</p></section>';
    const metadata = [
      ["Version", version],
      ["WordPress version", h["Requires at least"] || p.requires],
      ["Tested up to", p.tested],
      ["PHP version", h["Requires PHP"] || p.requires_php],
    ];
    body = `${chromeHTML()}<main class="page">${banner ? `<img class="banner" src="${escape(state.assets[banner])}" alt="Plugin banner">` : ""}<header class="plugin-header">${iconHTML()}<div class="plugin-title"><h1>${text(name)}</h1><p>By <span style="color:#3858e9">${escape(author)}</span></p></div><button class="download" disabled title="Visual preview only">Download</button></header><nav class="nav" aria-label="Plugin sections">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${state.tab === id ? "active" : ""}" aria-current="${state.tab === id ? "page" : "false"}">${label}</button>`).join("")}<span>Support</span></nav><div class="columns"><article class="content">${content}</article><aside class="meta"><dl>${metadata.map(([label, value]) => `<div class="meta-row"><dt>${label}</dt><dd>${text(value || "Not supplied")}</dd></div>`).join("")}</dl><h2>Tags</h2><div class="tags">${
      values(p.tags)
        .map((t) => `<span class="tag">${text(t)}</span>`)
        .join("") || '<span class="quiet">No tags supplied</span>'
    }</div><p class="preview-note">Live listing data, including ratings, install counts, and update dates, is not included.</p></aside></div></main>`;
  }
  const scroll = frame.contentDocument?.scrollingElement?.scrollTop || 0;
  frame.onload = () => {
    const doc = frame.contentDocument;
    doc.scrollingElement.scrollTop = scroll;
    doc.querySelectorAll("[data-tab]").forEach((button) =>
      button.addEventListener("click", () => {
        state.tab = button.dataset.tab;
        render();
      }),
    );
    doc.querySelectorAll("a").forEach((link) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
    doc.querySelectorAll("[data-asset]").forEach((img) => {
      const open = () => {
        $("large-image").src = state.assets[img.dataset.asset];
        $("large-image").alt = img.alt;
        $("image-caption").textContent = img.alt;
        $("image-dialog").showModal();
      };
      img.addEventListener("click", open);
      img.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });
  };
  frame.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; img-src data: blob:; font-src 'self'; script-src 'none'; base-uri 'none'; form-action 'none'"><link rel="stylesheet" href="${new URL(__PREVIEW_CSS_URL__, location.href).href}"><title>${text(name)} preview</title></head><body>${body}</body></html>`;
  $("empty-preview").hidden = true;
}
async function refreshWordPressVersion() {
  state.wordpress = { status: "loading", major: null };
  renderChecks();
  try {
    state.wordpress = { status: "ready", major: await latestWordPressMajor() };
  } catch {
    state.wordpress = { status: "error", major: null };
  }
  renderChecks();
}
function renderChecks() {
  const p = state.parsed;
  if (!p) return;
  const checks = collectPreflight(p, state);
  const count = checks.filter(([type]) => type === "warn").length;
  const passed = checks.filter(([type]) => type === "good").length;
  const notes = checks.filter(([type]) => type === "info").length;
  $("check-count").textContent =
    `${passed} passed · ${count} warning${count === 1 ? "" : "s"}${notes ? ` · ${notes} note${notes === 1 ? "" : "s"}` : ""}`;
  const order = { warn: 0, info: 1, good: 2 };
  checks.sort(([a], [b]) => order[a] - order[b]);
  const svg = (type) =>
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor"/>${type === "good" ? '<path d="m5 8 2 2 4-4" stroke="currentColor" stroke-width="1.5"/>' : '<path d="M8 4.5v4M8 10.5v1" stroke="currentColor" stroke-width="1.5"/>'}</svg>`;
  $("check-list").innerHTML = checks
    .map(
      ([type, message]) =>
        `<p class="check ${type}">${svg(type)}<span>${escape(message)}</span></p>`,
    )
    .join("");
  if (state.wordpress.status === "error") {
    const retry = document.createElement("button");
    retry.textContent = "Retry WordPress version check";
    retry.addEventListener("click", refreshWordPressVersion);
    $("check-list").append(retry);
  }
}
function renderAssets() {
  const names = Object.keys(state.assets).sort();
  $("asset-count").textContent = `${names.length} files`;
  $("asset-list").innerHTML = names
    .map((name) => `<li>${escape(name)}</li>`)
    .join("");
}
async function adopt(plugin) {
  ++state.sequence;
  clearTimeout(debounce);
  state.headers = plugin.headers || {};
  state.assets = plugin.assets || {};
  state.dirty = false;
  state.tab = "details";
  state.filename = plugin.filename || "readme.txt";
  $("readme-filename").textContent = state.filename;
  editor.value = plugin.readme;
  $("source-name").textContent = plugin.label || "Pasted readme";
  $("source-name").title = $("source-name").textContent;
  renderAssets();
  await parse();
}
let importSequence = 0;
async function importFiles(files, assetsOnly = false) {
  const current = ++importSequence;
  try {
    const plugin = await readPluginFiles(files, {
      assetsOnly,
      existingAssets: state.assets,
    });
    if (current !== importSequence) return;
    if (assetsOnly) {
      state.assets = plugin.assets;
      state.dirty = true;
      renderAssets();
      render();
      renderChecks();
      updateEditorState();
    } else {
      await adopt(plugin);
      if (current !== importSequence) return;
      $("open-dialog").close();
    }
  } catch (error) {
    if (current !== importSequence) return;
    $("open-error").textContent = error.message;
    if (!$("open-dialog").open) $("open-dialog").showModal();
  }
}
function openDialog() {
  $("open-error").textContent = "";
  $("open-dialog").showModal();
}
["open-button", "empty-open"].forEach((id) =>
  $(id).addEventListener("click", openDialog),
);
$("choose-folder").addEventListener("click", () => $("folder-input").click());
$("choose-file").addEventListener("click", () => $("readme-input").click());
$("github-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const current = ++importSequence;
  $("open-error").textContent = "";
  $("open-github").disabled = true;
  $("github-status").textContent = "Loading public GitHub repository…";
  $("github-status").hidden = false;
  try {
    const source = await resolveGitHubRepository($("github-url").value);
    if (current !== importSequence) return;
    const plugin = await loadGitHubPlugin(source);
    if (current !== importSequence) return;
    $("open-dialog").close();
    await adopt(plugin);
  } catch (error) {
    if (current !== importSequence) return;
    $("open-error").textContent = error.message;
  } finally {
    $("open-github").disabled = false;
    $("github-status").hidden = true;
  }
});
$("open-dialog").addEventListener("close", () => { ++importSequence; });
$("add-assets").addEventListener("click", () => $("asset-input").click());
$("folder-input").addEventListener("change", (e) => {
  importFiles(e.target.files);
  e.target.value = "";
});
$("readme-input").addEventListener("change", (e) => {
  importFiles(e.target.files);
  e.target.value = "";
});
$("asset-input").addEventListener("change", (e) => {
  importFiles(e.target.files, true);
  e.target.value = "";
});
editor.addEventListener("input", () => {
  ++importSequence;
  state.dirty = true;
  parser.cancel();
  ++state.sequence;
  updateEditorState();
  clearTimeout(debounce);
  debounce = setTimeout(parse, 350);
});
$("download").addEventListener("click", () => {
  const url = URL.createObjectURL(
    new Blob([editor.value], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = state.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status("Readme downloaded");
});
for (const view of ["page", "card", "listing"])
  $(view + "-view").addEventListener("click", () => {
    state.view = view;
    for (const other of ["page", "card", "listing"]) {
      $(other + "-view").classList.toggle("selected", other === view);
      $(other + "-view").setAttribute("aria-pressed", String(other === view));
    }
    frame.title =
      view === "listing"
        ? "WordPress admin Plugins screen preview"
        : "WordPress.org plugin page preview";
    render();
  });
for (const size of ["desktop", "mobile"])
  $(size).addEventListener("click", () => {
    frame.classList.toggle("mobile", size === "mobile");
    for (const other of ["desktop", "mobile"]) {
      $(other).classList.toggle("selected", other === size);
      $(other).setAttribute("aria-pressed", String(other === size));
    }
  });
window.addEventListener("beforeunload", (e) => {
  if (state.dirty && editor.value.trim()) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("pagehide", () => parser.dispose());

async function openGitHubPreview() {
  const params = new URLSearchParams(location.search);
  if (!params.has("repo") && !params.has("ref")) return;
  const current = ++importSequence;
  try {
    const source = parseGitHubSource({
      repo: params.get("repo"),
      ref: params.get("ref"),
      path: params.get("path") || "",
    });
    status("Loading public GitHub revision…");
    $("source-name").textContent = `Loading ${source.repo}…`;
    const plugin = await loadGitHubPlugin(source);
    if (current !== importSequence) return;
    await adopt(plugin);
  } catch (error) {
    if (current !== importSequence) return;
    status("GitHub preview unavailable");
    $("open-error").textContent = error.message;
    $("open-dialog").showModal();
  }
}
openGitHubPreview();
