import test from "node:test";
import assert from "node:assert/strict";
import {
  majorVersion,
  latestWordPressMajor,
  testedVersionCheck,
  VERSION_API,
} from "../public/wordpress-version.js";

test("WordPress major releases keep two components and ignore patches", () => {
  assert.equal(majorVersion("7.1.4"), "7.1");
  assert.equal(majorVersion("6.9"), "6.9");
  assert.equal(majorVersion("7.1-RC1"), null);
  assert.equal(majorVersion("banana"), null);
  assert.equal(testedVersionCheck("7.1", "7.1")[0], "good");
  assert.equal(testedVersionCheck("7.1.0", "7.1")[0], "good");
  for (const value of ["6.9", "7.0.8", "7.2", "", null]) {
    const [type, message] = testedVersionCheck(value, "7.1");
    assert.equal(type, "warn");
    assert.match(message, /7\.1/);
  }
});
test("stable API lookup ignores prereleases and legacy maintenance branches", async () => {
  let request;
  const latest = await latestWordPressMajor(async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({
        offers: [
          { response: "autoupdate", current: "6.9.11" },
          { response: "upgrade", current: "7.1.4" },
          { response: "upgrade", current: "7.2-beta1" },
          { response: "development", current: "8.0" },
        ],
      }),
    };
  });
  assert.equal(latest, "7.1");
  assert.equal(request.url, VERSION_API);
  assert.equal(request.options.credentials, "omit");
  assert.equal(request.options.referrerPolicy, "no-referrer");
  assert.equal(request.options.body, undefined);
});
test("version lookup compares release numbers numerically and fails honestly", async () => {
  assert.equal(
    await latestWordPressMajor(async () => ({
      ok: true,
      json: async () => ({
        offers: [
          { response: "upgrade", current: "9.9.4" },
          { response: "current", version: "10.0.1" },
        ],
      }),
    })),
    "10.0",
  );
  await assert.rejects(
    latestWordPressMajor(async () => ({ ok: false })),
    /unavailable/,
  );
  await assert.rejects(
    latestWordPressMajor(async () => ({
      ok: true,
      json: async () => ({ offers: [] }),
    })),
    /No stable/,
  );
  await assert.rejects(
    latestWordPressMajor(async () => {
      throw new Error("Offline");
    }),
    /Offline/,
  );
});
