import { testedVersionCheck } from "./wordpress-version.js";
const values = (object) => Object.values(object || {});
const entries = (object) => Object.entries(object || {});
const plain = (html) => String(html || "").replace(/<[^>]*>/g, "");
const decode = (value) =>
  String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '\"')
    .replace(/&#0*39;/g, "'");
const warningMessages = {
  trimmed_short_description:
    "Short description exceeds 150 characters and will be truncated.",
  no_short_description_present:
    "No short description found. WordPress.org uses the beginning of the description.",
  invalid_plugin_name_header:
    "The plugin name header is missing or uses the sample “Plugin Name” value.",
  too_many_tags:
    "More than five tags: WordPress.org keeps only the first five.",
  ignored_tags: "Generic tags such as “wordpress” and “plugin” are ignored.",
  license_missing: "No license header found.",
  invalid_license: "The license was not recognized by the parser.",
  incompatible_license: "The license may not be GPL-compatible.",
  requires_header_ignored:
    "The “Requires at least” version is invalid and will be ignored.",
  tested_header_ignored:
    "The “Tested up to” version is invalid and will be ignored.",
  requires_php_header_ignored:
    "The “Requires PHP” version is invalid and will be ignored.",
};
export function collectPreflight(
  p,
  { headers = {}, assets = {}, wordpress = { status: "idle" } } = {},
) {
  const findAsset = (prefix) =>
    Object.keys(assets).find(
      (name) => name.replace(/\.(?:png|jpe?g|gif|webp|svg)$/i, "") === prefix,
    );
  const checks = [];
  checks.push([
    p.short_description_length > 150
      ? "warn"
      : p.short_description_length
        ? "good"
        : "info",
    `${p.short_description_length} / 150 characters in the short description.${p.short_description_length > 150 ? " It will be truncated." : ""}`,
  ]);
  for (const [key, value] of entries(p.warnings)) {
    if (key === "trimmed_short_description") continue;
    const message =
      warningMessages[key] ||
      (key.startsWith("trimmed_section_")
        ? `${key.slice(16).replaceAll("_", " ")} exceeds the parser’s word limit and will be truncated.`
        : `Parser warning: ${key.replaceAll("_", " ")}.`);
    checks.push([
      "warn",
      message + (Array.isArray(value) ? ` (${value.join(", ")})` : ""),
    ]);
  }
  if (p.name && !p.warnings.invalid_plugin_name_header)
    checks.push(["good", "Plugin name header recognized."]);
  if (
    p.license &&
    !p.warnings.invalid_license &&
    !p.warnings.incompatible_license &&
    !p.warnings.license_missing
  )
    checks.push(["good", `License header recognized: ${decode(p.license)}.`]);
  if (
    values(p.tags).length &&
    !p.warnings.too_many_tags &&
    !p.warnings.ignored_tags
  )
    checks.push([
      "good",
      `${values(p.tags).length} tags accepted within the five-tag limit.`,
    ]);
  for (const [section, content] of entries(p.sections)) {
    if (plain(content).trim() && !p.warnings[`trimmed_section_${section}`])
      checks.push([
        "good",
        `${section.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase())} is within the parser’s word limit.`,
      ]);
  }
  if (wordpress.status === "ready") {
    checks.push(testedVersionCheck(p.tested, wordpress.major));
  } else {
    checks.push([
      "info",
      wordpress.status === "error"
        ? "Latest WordPress version could not be checked. Other preflight checks still apply."
        : "Checking the latest WordPress major release…",
    ]);
  }
  checks.push(...(p.preflight_checks || []));
  if (!findAsset("banner-1544x500") && !findAsset("banner-772x250"))
    checks.push([
      "info",
      "No banner loaded. Add banner-772x250.png or banner-1544x500.png.",
    ]);
  else checks.push(["good", "Banner image loaded."]);
  if (
    !findAsset("icon") &&
    !findAsset("icon-256x256") &&
    !findAsset("icon-128x128")
  )
    checks.push([
      "info",
      "No icon loaded. A placeholder appears in the preview.",
    ]);
  else checks.push(["good", "Plugin icon loaded."]);
  for (const [number] of entries(p.screenshots))
    if (!findAsset(`screenshot-${number}`))
      checks.push([
        "warn",
        `Screenshot ${number} has a caption but no matching image.`,
      ]);
    else
      checks.push([
        "good",
        `Screenshot ${number} has a matching image and caption.`,
      ]);
  const captionNumbers = new Set(Object.keys(p.screenshots || {}));
  for (const name of Object.keys(assets)) {
    const m = name.match(/^screenshot-(\d+)\./);
    if (m && !captionNumbers.has(m[1]))
      checks.push([
        "info",
        `${name} has no caption in the Screenshots section.`,
      ]);
  }
  if (!headers["Plugin Name"])
    checks.push([
      "info",
      "Plugin PHP header not loaded. The directory previews use readme values for version and author.",
    ]);
  else checks.push(["good", "Plugin PHP header loaded."]);
  return checks;
}
export function summarizeChecks(checks) {
  return {
    passed: checks.filter(([type]) => type === "good").length,
    warnings: checks.filter(([type]) => type === "warn").length,
    notes: checks.filter(([type]) => type === "info").length,
  };
}
