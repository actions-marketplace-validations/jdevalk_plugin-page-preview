import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendFile } from "node:fs/promises";
import { loadAndParseConfig } from "@cloudflare/config";
import {
  BUILD_OUTPUT_VERSION,
  cleanBuildOutputDir,
  writeRootConfig,
  writeWorkerConfig,
  writeAssets,
  getWorkerAssetsDir,
  readBuildOutput,
} from "@cloudflare/build-output-utils";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (!["production", "preview"].includes(mode)) {
  throw new Error("Choose production or preview explicitly.");
}
const context = { isPreview: mode === "preview", mode };
const { result } = await loadAndParseConfig(
  path.join(root, "cloudflare.config.ts"),
  context,
);
if (!result.success) throw result.error;
const { worker, containers = [], ...settings } = result.data;
if (containers.length)
  throw new Error("This build supports static assets only.");
if (context.isPreview && worker.domains.length)
  throw new Error("Preview builds must not claim a custom domain.");
await cleanBuildOutputDir(root);
await writeRootConfig({ root, settings, buildContext: context });
await writeWorkerConfig({ root, config: worker });
await writeAssets({ root, sourceDirectory: path.join(root, "dist") });
if (context.isPreview) {
  await appendFile(
    path.join(getWorkerAssetsDir(root), "_headers"),
    "\n/*\n  X-Robots-Tag: noindex, nofollow\n",
  );
}
await readBuildOutput(root);
console.log(
  `Prepared ${mode} static assets for cf in .cloudflare/output/${BUILD_OUTPUT_VERSION}/.`,
);
