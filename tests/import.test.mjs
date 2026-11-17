import test from "node:test";
import assert from "node:assert/strict";
import { readPluginFiles, headersFrom } from "../public/plugin-files.js";

function file(relative, content = "fixture") {
  const f = new File([content], relative.split("/").at(-1));
  Object.defineProperty(f, "webkitRelativePath", {
    value: relative.includes("/") ? relative : "",
  });
  return f;
}
test("folder imports read only the plugin header and recognized listing images", async () => {
  const result = await readPluginFiles([
    file("sample/readme.txt", "=== Sample ==="),
    file(
      "sample/plugin.php",
      '<?php\n/*\nPlugin Name: Sample\nAuthor: Alice\nVersion: 1.0\n*/\nthrow new Exception("Never execute");',
    ),
    file("sample/.wordpress-org/icon-128x128.png"),
    file("sample/.wordpress-org/private.txt"),
    file("sample/vendor/other.php", "Plugin Name: Wrong"),
  ]);
  assert.equal(result.label, "sample");
  assert.equal(result.headers.Author, "Alice");
  assert.deepEqual(Object.keys(result.assets), ["icon-128x128.png"]);
  assert.match(result.assets["icon-128x128.png"], /^data:image\/png;base64,/);
});
test("SVN trunk imports find sibling assets", async () => {
  const result = await readPluginFiles([
    file("sample/trunk/readme.txt", "=== Sample ==="),
    file("sample/assets/banner-772x250.png"),
  ]);
  assert.ok(result.assets["banner-772x250.png"]);
});
test("single readme import clears unrelated assets and metadata", async () => {
  const result = await readPluginFiles(
    [file("readme.txt", "=== Another ===")],
    { existingAssets: { "icon.svg": "old" } },
  );
  assert.deepEqual(result.assets, {});
  assert.deepEqual(result.headers, {});
});
test("missing readme, ambiguous plugins, and oversized files produce useful errors", async () => {
  await assert.rejects(readPluginFiles([file("other.txt")]), /No readme/);
  await assert.rejects(
    readPluginFiles([file("root/one/readme.txt"), file("root/two/readme.txt")]),
    /single plugin folder/,
  );
  await assert.rejects(
    readPluginFiles([file("readme.txt", "a".repeat(524289))]),
    /512 KB/,
  );
});
test("additional images preserve previous recognized assets", async () => {
  const result = await readPluginFiles([file("screenshot-1.png")], {
    assetsOnly: true,
    existingAssets: { "icon.svg": "data:image/svg+xml;base64,PHN2Zy8+" },
  });
  assert.equal(Object.keys(result.assets).length, 2);
});
test("header reader supports standard PHP docblocks", () => {
  assert.equal(
    headersFrom("/**\n * Plugin Name: Test\n * Version: 3.0\n */").Version,
    "3.0",
  );
});

test("readme.txt takes precedence over README.md regardless of case and input order", async () => {
  for (const files of [
    [
      file("sample/README.md", "Markdown"),
      file("sample/ReadMe.TXT", "Directory"),
    ],
    [
      file("sample/ReadMe.TXT", "Directory"),
      file("sample/README.md", "Markdown"),
    ],
  ]) {
    const result = await readPluginFiles(files);
    assert.equal(result.readme, "Directory");
    assert.equal(result.filename, "ReadMe.TXT");
  }
});
test("README.md fallback uses its own folder's PHP header and assets", async () => {
  const result = await readPluginFiles([
    file("sample/README.md", "# Markdown Plugin"),
    file("sample/vendor/readme.txt", "Wrong"),
    file(
      "sample/plugin.php",
      "/*\nPlugin Name: PHP Name\nDescription: Admin description.\nPlugin URI: https://example.com/plugin\n*/",
    ),
    file("sample/assets/icon.svg", "<svg/>"),
  ]);
  assert.equal(result.readme, "# Markdown Plugin");
  assert.equal(result.filename, "README.md");
  assert.equal(result.headers.Description, "Admin description.");
  assert.equal(result.headers["Plugin URI"], "https://example.com/plugin");
  assert.ok(result.assets["icon.svg"]);
  const standalone = await readPluginFiles([file("README.md", "# Single")]);
  assert.equal(standalone.filename, "README.md");
  await assert.rejects(
    readPluginFiles([
      file("one/readme.txt"),
      file("one/README.md"),
      file("two/README.md"),
    ]),
    /single plugin folder/,
  );
});

test("empty PHP header values never consume the following header", () => {
  const headers = headersFrom(
    "/*\nPlugin Name: Sample\nRequires at least:\nRequires PHP: 7.4\nVersion:\nAuthor: Alice\n*/",
  );
  assert.equal(headers["Requires at least"], "");
  assert.equal(headers["Requires PHP"], "7.4");
  assert.equal(headers.Version, "");
  assert.equal(headers.Author, "Alice");
});
