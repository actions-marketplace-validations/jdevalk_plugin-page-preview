import test from "node:test";
import assert from "node:assert/strict";
import { parseReadme } from "./helpers/native-parser.mjs";

const readme = (short, body = "== Description ==\n\nA **bold** description.") =>
  `=== My Plugin ===\nContributors: @alice, bob\nTags: search, plugin, wordpress, two, three, four, five, six\nRequires at least: 6.7\nTested up to: 6.9\nRequires PHP: 7.4\nStable tag: 1.2.3\nLicense: GPLv2 or later\n\n${short}\n\n${body}\n`;

test("upstream parser handles exact boundary, Unicode and truncation", async () => {
  for (const character of ["a", "é", "🔎"]) {
    const exact = await parseReadme(readme(character.repeat(150)));
    assert.equal(exact.short_description_length, 150);
    assert.equal(exact.warnings.trimmed_short_description, undefined);
    const long = await parseReadme(readme(character.repeat(151)));
    assert.equal(long.short_description_length, 151);
    assert.equal(long.warnings.trimmed_short_description, true);
  }
});
test("entities are counted after decoding and markup is parsed by upstream", async () => {
  const result = await parseReadme(readme("Tom & Jerry’s plugin."));
  assert.equal(result.short_description_length, 21);
  assert.match(result.sections.description, /<strong>bold<\/strong>/);
  assert.deepEqual(result.contributors, ["alice", "bob"]);
  assert.equal(result.tags.length, 5);
  assert.ok(result.warnings.too_many_tags);
});
test("FAQ, screenshots, installation, changelog and custom sections survive", async () => {
  const result = await parseReadme(
    readme(
      "A plugin.",
      `== Description ==\n\nFirst.\n\n== Frequently Asked Questions ==\n\n= Does it work? =\n\nYes, with \`code\`.\n\n== Screenshots ==\n\n1. The first view.\n2. The second view.\n\n== Installation ==\n\n1. Activate it.\n\n== Changelog ==\n\n= 1.2.3 =\n\n* Fixed a bug.\n\n== Special notes ==\n\nExtra text.`,
    ),
  );
  assert.match(result.sections.description, /Special notes/);
  assert.match(result.sections.faq, /Does it work/);
  assert.match(result.faq["Does it work?"], /<code>code<\/code>/);
  assert.equal(Object.keys(result.screenshots).length, 2);
  assert.match(result.sections.installation, /<ol>/);
  assert.match(result.sections.changelog, /Fixed a bug/);
});
test("upstream sanitizer strips executable HTML and unsafe links", async () => {
  const result = await parseReadme(
    readme(
      "Safe.",
      `== Description ==\n\n<script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)" onclick="alert(4)">Click</a><iframe src="https://example.com"></iframe>`,
    ),
  );
  assert.doesNotMatch(
    result.sections.description,
    /<script|<iframe|<img|onerror|onclick|javascript:/i,
  );
});
test("readme content is never treated as a path or URL", async () => {
  const result = await parseReadme("/etc/passwd");
  assert.equal(result.name, "/etc/passwd");
  assert.doesNotMatch(JSON.stringify(result), /root:x:/);
});
test("missing and malformed headers produce parser warnings", async () => {
  const result = await parseReadme(
    "Contributors: alice\nRequires PHP: banana\nTested up to: nope\n\n== Description ==\n\nText.",
  );
  assert.equal(result.warnings.invalid_plugin_name_header, true);
  assert.equal(result.warnings.license_missing, true);
  assert.equal(result.warnings.requires_php_header_ignored, true);
  assert.equal(result.warnings.tested_header_ignored, true);
});

test("admin fields preserve allowed header markup and strip unsafe HTML independently of the readme", async () => {
  const result = await parseReadme(readme("Directory short description."), {
    "Plugin Name":
      '<a href="https://example.com">Header <strong>Name</strong></a>',
    Description:
      'Admin <code>description</code> <a href="javascript:alert(1)" onclick="bad()">link</a><img src=x onerror=bad()>',
    Author: "<em>Alice</em>",
    Version: "2.0",
    "Author URI": "javascript:alert(1)",
    "Plugin URI": "https://example.com/plugin?a=1&b=2",
  });
  assert.equal(
    result.admin_headers["Plugin Name"],
    "Header <strong>Name</strong>",
  );
  assert.match(
    result.admin_headers.Description,
    /Admin <code>description<\/code>/,
  );
  assert.doesNotMatch(
    JSON.stringify(result.admin_headers),
    /javascript:|onclick|onerror|<img/,
  );
  assert.equal(result.admin_headers["Author URI"], "");
  assert.equal(result.admin_headers.Version, "2.0");
  assert.equal(result.name, "My Plugin");
  assert.equal(result.short_description, "Directory short description.");
});
test("Markdown headings are processed by the same upstream readme parser", async () => {
  const result = await parseReadme(
    "# Markdown Plugin\nContributors: alice\nLicense: GPLv2 or later\n\nA Markdown readme.\n\n## Description\n\nA **bold** feature.",
  );
  assert.equal(result.name, "Markdown Plugin");
  assert.match(result.sections.description, /<strong>bold<\/strong>/);
});

const consistentHeaders = {
  "Plugin Name": "My Plugin",
  Version: "1.2.3",
  "Requires at least": "6.7",
  "Requires PHP": "7.4",
};
const releaseBody = (heading = "1.2.3") =>
  `== Description ==\n\nA feature.\n\n== Installation ==\n\n1. Activate the plugin.\n\n== Frequently Asked Questions ==\n\n= Does it work? =\n\nYes.\n\n== Screenshots ==\n\n1. The plugin interface.\n\n== Changelog ==\n\n= ${heading} =\n\n* Fixed a bug.`;

test("matching release and requirement headers produce no objective warnings", async () => {
  const result = await parseReadme(
    readme("A plugin.", releaseBody()),
    consistentHeaders,
  );
  assert.deepEqual(
    result.preflight_checks.filter(([type]) => type === "warn"),
    [],
  );
});
test("PHP metadata omissions are detected even when the readme supplies values", async () => {
  const result = await parseReadme(readme("A plugin.", releaseBody()), {
    "Plugin Name": "My Plugin",
  });
  const messages = result.preflight_checks
    .filter(([type]) => type === "warn")
    .map(([, message]) => message);
  assert.equal(messages.length, 3);
  assert.ok(messages.some((message) => message.includes("no Version header")));
  assert.ok(
    messages.some((message) => message.includes("no “Requires at least”")),
  );
  assert.ok(messages.some((message) => message.includes("no “Requires PHP”")));
});
test("requirements use the PHP header and detect conflicts and impossible tested ranges", async () => {
  const result = await parseReadme(readme("A plugin.", releaseBody()), {
    ...consistentHeaders,
    "Requires at least": "7.1",
    "Requires PHP": "8.2",
  });
  const messages = result.preflight_checks
    .filter(([type]) => type === "warn")
    .map(([, message]) => message);
  assert.equal(messages.length, 3);
  assert.ok(
    messages.some((message) => message.includes("PHP header 7.1, readme 6.7")),
  );
  assert.ok(
    messages.some((message) => message.includes("PHP header 8.2, readme 7.4")),
  );
  assert.ok(messages.some((message) => message.includes("below the minimum")));
  const invalid = await parseReadme(readme("A plugin."), {
    ...consistentHeaders,
    "Requires PHP": "banana",
  });
  assert.ok(
    invalid.preflight_checks.some(([, message]) =>
      message.includes("not a numeric version"),
    ),
  );
});
test("minimum comparison treats Tested up to as a major WordPress branch", async () => {
  const result = await parseReadme(
    readme("A plugin.", releaseBody()).replace(
      "Requires at least: 6.7",
      "Requires at least: 6.9.1",
    ),
    { ...consistentHeaders, "Requires at least": "6.9.1" },
  );
  assert.ok(
    !result.preflight_checks.some(([, message]) =>
      message.includes("below the minimum"),
    ),
  );
});
test("changelog checks support Markdown, date suffixes and Unreleased headings", async () => {
  for (const heading of [
    "1.2.3",
    "v1.2.3",
    "Version 1.2.3 - 2026-11-17",
    "1.2.3 (2026-11-17)",
  ]) {
    const result = await parseReadme(
      readme(
        "A plugin.",
        releaseBody(heading).replace(
          "= " + heading,
          "= Unreleased =\n\n* Upcoming work.\n\n= " + heading,
        ),
      ),
      consistentHeaders,
    );
    assert.ok(
      !result.preflight_checks.some(
        ([type, message]) => type !== "good" && /changelog/i.test(message),
      ),
    );
  }
  const markdown = await parseReadme(
    readme("A plugin.", "## Changelog\n\n### 1.2.3\n\n* A fix."),
    consistentHeaders,
  );
  assert.ok(
    !markdown.preflight_checks.some(
      ([type, message]) => type !== "good" && /changelog/i.test(message),
    ),
  );
});
test("changelog mismatches compare both release sources and skip trunk as a version", async () => {
  const result = await parseReadme(
    readme("A plugin.", releaseBody("1.2.2")),
    consistentHeaders,
  );
  assert.equal(
    result.preflight_checks.filter(([, message]) =>
      message.includes("first changelog release"),
    ).length,
    2,
  );
  const trunk = await parseReadme(
    readme("A plugin.", releaseBody()).replace(
      "Stable tag: 1.2.3",
      "Stable tag: trunk",
    ),
    consistentHeaders,
  );
  assert.ok(!trunk.preflight_checks.some(([type]) => type === "warn"));
  const prerelease = await parseReadme(
    readme("A plugin.", releaseBody("1.2.3-beta1")),
    consistentHeaders,
  );
  assert.equal(
    prerelease.preflight_checks.filter(([, message]) =>
      message.includes("first changelog release"),
    ).length,
    2,
  );
});
test("missing and empty sections warn without inventing PHP omissions", async () => {
  const result = await parseReadme(
    readme(
      "A plugin.",
      "== Installation ==\n\n<!-- TODO -->\n\n== Changelog ==\n\n<!-- TODO -->",
    ),
  );
  assert.deepEqual(
    result.preflight_checks.filter(([type]) => type === "warn"),
    [
      ["warn", "The Installation section is missing or empty."],
      ["warn", "The FAQ section is missing or empty."],
      ["warn", "The Changelog section is missing or empty."],
      ["warn", "The Screenshots section is missing or has no captions."],
    ],
  );
  const unknown = await parseReadme(
    readme("A plugin.", releaseBody("Recent improvements")),
  );
  assert.ok(
    unknown.preflight_checks.some(
      ([type, message]) =>
        type === "info" && message.includes("could not be checked"),
    ),
  );
  const missing = await parseReadme(
    "=== Sample ===\nLicense: GPLv3\n\nA plugin.\n\n== Description ==\n\nText.",
  );
  assert.ok(
    missing.preflight_checks.some(([, message]) =>
      message.includes("No Stable tag"),
    ),
  );
  assert.ok(
    missing.preflight_checks.some(([, message]) =>
      message.includes("No “Requires PHP”"),
    ),
  );
});

test("passing checks describe verified results and never mark missing or conflicting metadata as matched", async () => {
  const result = await parseReadme(
    readme("A plugin.", releaseBody()),
    consistentHeaders,
  );
  const passed = result.preflight_checks
    .filter(([type]) => type === "good")
    .map(([, message]) => message);
  assert.ok(passed.some((message) => message.includes("Stable tag matches")));
  assert.ok(
    passed.some((message) => message.includes("“Requires PHP” matches")),
  );
  assert.ok(passed.some((message) => message.includes("meets the minimum")));
  assert.ok(
    passed.some((message) =>
      message.includes("changelog release matches PHP Version"),
    ),
  );
  const conflicting = await parseReadme(
    readme("A plugin.", releaseBody("1.0")),
    { ...consistentHeaders, "Requires PHP": "banana" },
  );
  const conflictingPasses = conflicting.preflight_checks
    .filter(([type]) => type === "good")
    .map(([, message]) => message);
  assert.ok(
    !conflictingPasses.some(
      (message) =>
        message.includes("“Requires PHP” matches") ||
        message.includes("changelog release matches"),
    ),
  );
  const alone = await parseReadme(readme("A plugin.", releaseBody()));
  const alonePasses = alone.preflight_checks
    .filter(([type]) => type === "good")
    .map(([, message]) => message);
  assert.ok(
    !alonePasses.some((message) => /matches.*PHP|PHP.*declared/.test(message)),
  );
});
