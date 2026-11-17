import { build } from "esbuild";
import { mkdir, readFile, writeFile, readdir, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const hash = (data) =>
  createHash("sha256").update(data).digest("hex").slice(0, 12);
const out = path.join(root, "dist");
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "assets"), { recursive: true });
const files = {};
async function collect(folder) {
  for (const item of (await readdir(folder, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const filename = path.join(folder, item.name);
    if (item.isDirectory()) await collect(filename);
    else if (filename.endsWith(".php"))
      files["/app/" + filename.split(path.sep).join("/")] = await readFile(
        filename,
        "utf8",
      );
  }
}
await collect("vendor");
await collect("php");
const parserFiles = JSON.stringify(files);
const filesName = `files-${hash(parserFiles)}.json`;
await writeFile(path.join(out, "assets", filesName), parserFiles);
const runtimePackage = "node_modules/@php-wasm/web-8-4/asyncify";
const loader = await readFile(`${runtimePackage}/php_8_4.js`, "utf8");
const wasmPath = loader.match(/new URL\('\.\/([^']+\.wasm)'/)[1];
const wasm = await readFile(path.join(runtimePackage, wasmPath));
const runtimeName = `runtime-${hash(Buffer.concat([Buffer.from(loader), wasm]))}`;
await mkdir(path.join(out, "assets", runtimeName, path.dirname(wasmPath)), {
  recursive: true,
});
await writeFile(path.join(out, "assets", runtimeName, "php_8_4.js"), loader);
await writeFile(path.join(out, "assets", runtimeName, wasmPath), wasm);
const worker = await build({
  entryPoints: ["public/parser-worker.js"],
  outdir: "dist/assets",
  entryNames: "[name]-[hash]",
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  metafile: true,
  external: ["worker_threads"],
  define: { __PHP_FILES_URL__: JSON.stringify("./" + filesName) },
  plugins: [
    {
      name: "php-runtime",
      setup(build) {
        build.onResolve({ filter: /^php-runtime$/ }, () => ({
          path: `./${runtimeName}/php_8_4.js`,
          external: true,
        }));
      },
    },
  ],
});
const workerFile = Object.keys(worker.metafile.outputs).find((name) =>
  name.endsWith(".js"),
);
const cssNames = {};
for (const filename of ["style.css", "preview.css"]) {
  const css = await readFile("public/" + filename);
  cssNames[filename] =
    `assets/${filename.replace(".css", "")}-${hash(css)}.css`;
  await writeFile(path.join(out, cssNames[filename]), css);
}
const app = await build({
  entryPoints: ["public/app.js"],
  outdir: "dist/assets",
  entryNames: "[name]-[hash]",
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  metafile: true,
  define: {
    __PARSER_WORKER_URL__: JSON.stringify("./" + path.basename(workerFile)),
    __PREVIEW_CSS_URL__: JSON.stringify("/" + cssNames["preview.css"]),
  },
});
const appFile = Object.keys(app.metafile.outputs).find((name) =>
  name.endsWith(".js"),
);
let html = await readFile("public/index.html", "utf8");
html = html
  .replace("/app.js", "/" + path.relative("dist", appFile))
  .replace("/style.css", "/" + cssNames["style.css"]);
await writeFile(path.join(out, "index.html"), html);
await cp("public/_headers", path.join(out, "_headers"));
await writeFile(
  path.join(out, "404.html"),
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>Page not found</title><h1>Page not found</h1><p><a href="/">Open Plugin Page Preview</a></p></html>',
);
await mkdir(path.join(out, "licenses"), { recursive: true });
for (const [source, target] of [
  ["LICENSE", "project.txt"],
  ["vendor/wordpress/LICENSE.txt", "wordpress.txt"],
  [
    "vendor/wordpress-org/libs/michelf-php-markdown-1.6.0/License.md",
    "php-markdown.txt",
  ],
  ["node_modules/@php-wasm/web-8-4/LICENSE", "php-wasm.txt"],
  ["vendor/sources.json", "sources.json"],
])
  await cp(source, path.join(out, "licenses", target));
// Keep the PHP source and required notices available with the distributed runtime.
await cp(
  "vendor/wordpress/sodium_compat/LICENSE",
  path.join(out, "licenses", "sodium-compat.txt"),
);
const built = [];
async function inventory(folder) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, item.name);
    if (item.isDirectory()) await inventory(filename);
    else {
      const bytes = await readFile(filename);
      if (bytes.length > 25 * 1024 * 1024)
        throw new Error(
          `Static asset exceeds Cloudflare's file limit: ${filename}`,
        );
      built.push({
        file: path.relative(out, filename),
        bytes: bytes.length,
        gzipBytes: gzipSync(bytes).length,
      });
    }
  }
}
await inventory(out);
await writeFile(
  "dist/asset-manifest.json",
  JSON.stringify(built, null, 2) + "\n",
);
console.log(
  `Static app built in dist/ (${(built.filter((f) => f.file.startsWith("assets/")).reduce((n, f) => n + f.gzipBytes, 0) / 1e6).toFixed(1)} MB gzip estimate). No PHP server is required.`,
);
