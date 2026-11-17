import { defineConfig } from "cf/config";

export default defineConfig(({ isPreview }) => ({
  accountId: "c53e64d218c83cb220b523a637ffd079",
  worker: {
    name: "plugin-page-preview",
    compatibilityDate: "2026-11-17",
    workersDev: false,
    previewUrls: true,
    domains: isPreview ? [] : ["readme.joost.blog"],
    assets: {
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "404-page",
    },
  },
}));
