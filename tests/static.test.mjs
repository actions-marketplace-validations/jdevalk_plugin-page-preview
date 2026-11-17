import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

test("static app serves WASM with CSP and caching, and has no parsing endpoint", async () => {
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Static server startup timed out"));
    }, 5000);
    child.once("error", reject);
    child.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
  });
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(
      page.headers.get("content-security-policy"),
      /wasm-unsafe-eval/,
    );
    const html = await page.text();
    assert.doesNotMatch(html, /path-form|sent to.*server/);
    const manifest = JSON.parse(
      await readFile("dist/asset-manifest.json", "utf8"),
    );
    assert.ok(manifest.every((file) => file.bytes <= 25 * 1024 * 1024));
    const wasm = manifest.find((file) => file.file.endsWith(".wasm"));
    const response = await fetch(`${url}/${wasm.file}`, { method: "HEAD" });
    assert.equal(response.headers.get("content-type"), "application/wasm");
    assert.match(response.headers.get("cache-control"), /immutable/);
    assert.equal(
      (
        await fetch(url + "/api/parse", {
          method: "POST",
          body: "private readme",
        })
      ).status,
      405,
    );
    assert.equal((await fetch(url + "/api/session")).status, 404);
    assert.equal((await fetch(url + "/package.json")).status, 404);
    const worker = manifest.find((file) =>
      /parser-worker-.*\.js$/.test(file.file),
    );
    assert.ok(worker);
    const bundledApp = await (
      await fetch(url + html.match(/src="([^\"]+\.js)"/)[1])
    ).text();
    assert.doesNotMatch(bundledApp, /\/api\/(?:parse|load|session)/);
  } finally {
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill();
    });
  }
});
