import test from "node:test";
import assert from "node:assert/strict";
import { loadAndParseConfig } from "@cloudflare/config";

test("preview configuration cannot claim the production custom domain", async () => {
  const file = new URL("../cloudflare.config.ts", import.meta.url).pathname;
  const { result: production } = await loadAndParseConfig(file, {
    isPreview: false,
    mode: "production",
  });
  const { result: preview } = await loadAndParseConfig(file, {
    isPreview: true,
    mode: "preview",
  });
  assert.ok(production.success);
  assert.ok(preview.success);
  assert.deepEqual(production.data.worker.domains, ["readme.joost.blog"]);
  assert.deepEqual(preview.data.worker.domains, []);
  assert.equal(preview.data.worker.name, production.data.worker.name);
  assert.equal(production.data.worker.previewUrls, true);
  assert.equal(preview.data.worker.workersDev, false);
});
