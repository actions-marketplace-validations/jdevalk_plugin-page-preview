import test from "node:test";
import assert from "node:assert/strict";
import {
  loadGitHubPlugin,
  parseGitHubSource,
  githubPreviewURL,
  parseGitHubRepositoryURL,
  resolveGitHubRepository,
} from "../public/github-source.js";
import {
  makeComment,
  publishComment,
  commentMarker,
} from "../action/comment.mjs";
import { collectPreflight } from "../public/preflight.js";
const sha = "a".repeat(40);
const source = { repo: "owner/plugin", ref: sha, path: "" };
const json = (body) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
test("repository links accept GitHub URLs and reject other hosts and page URLs", () => {
  for (const url of [
    "https://github.com/owner/plugin",
    " https://github.com/owner/plugin/ ",
    "https://github.com/owner/plugin.git",
    "https://github.com/owner/plugin?tab=readme-ov-file#readme",
  ]) assert.equal(parseGitHubRepositoryURL(url), "owner/plugin");
  for (const url of [
    "owner/plugin", "https://example.com/owner/plugin",
    "https://github.com.evil.test/owner/plugin", "http://github.com/owner/plugin",
    "https://user:secret@github.com/owner/plugin", "https://github.com:444/owner/plugin",
    "https://github.com/owner/plugin/tree/main", "https://github.com/owner/plugin/issues",
    "https://github.com/owner", "https://github.com/owner/.git",
  ]) assert.throws(() => parseGitHubRepositoryURL(url), /repository link/);
});
test("repository URLs resolve the default branch to an immutable import", async () => {
  const fixture = fakeRepository();
  const resolved = await resolveGitHubRepository("https://github.com/owner/plugin", {
    fetcher: async (url, options) => {
      assert.equal(url, "https://api.github.com/repos/owner/plugin/commits?per_page=1");
      assert.equal(options.credentials, "omit");
      assert.equal(options.referrerPolicy, "no-referrer");
      return json([{ sha }]);
    },
  });
  assert.deepEqual(resolved, source);
  const plugin = await loadGitHubPlugin(resolved, fixture);
  assert.match(plugin.readme, /Public Plugin/);
  assert.ok(fixture.calls.some(({ url }) => url.includes(`/git/trees/${sha}`)));
});
test("repository resolution rejects invalid input, empty repositories, and API failures", async () => {
  await assert.rejects(resolveGitHubRepository("https://example.com/owner/plugin", {
    fetcher: () => assert.fail("Invalid URLs must not be fetched"),
  }), /repository link/);
  for (const body of [[], {}, [{ sha: "main" }]]) {
    await assert.rejects(resolveGitHubRepository("https://github.com/owner/plugin", {
      fetcher: async () => json(body),
    }), /could not find a commit/);
  }
  for (const status of [403, 404, 409, 429]) {
    await assert.rejects(resolveGitHubRepository("https://github.com/owner/plugin", {
      fetcher: async () => new Response("Unavailable", { status }),
    }), /request limit|could not load/);
  }
});
function fakeRepository({ privateRepo = false, truncated = false } = {}) {
  const calls = [];
  const contents = {
    "README.md": "# Wrong readme",
    "readme.txt": "=== Public Plugin ===\n\nA plugin.",
    "plugin.php":
      "<?php\n/*\nPlugin Name: Public Plugin\nVersion: 1.0\n*/\nthrow new Exception('Never execute');",
    ".wordpress-org/icon.svg": "<svg></svg>",
  };
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url === "https://api.github.com/repos/owner/plugin")
      return json({ private: privateRepo });
    if (url.includes("/git/trees/"))
      return json({
        truncated,
        tree: Object.entries(contents).map(([path, text]) => ({
          path,
          type: "blob",
          mode: "100644",
          size: text.length,
        })),
      });
    const path = url.split(`/${sha}/`)[1];
    return path in contents
      ? new Response(contents[path])
      : new Response("Missing", { status: 404 });
  };
  return { calls, fetcher };
}
test("preview sources require public GitHub names and immutable commits", () => {
  assert.equal(new URL(githubPreviewURL(source)).searchParams.get("ref"), sha);
  for (const input of [
    { ...source, repo: "https://example.com" },
    { ...source, ref: "main" },
    { ...source, path: "../private" },
    { ...source, path: "/etc" },
  ]) {
    assert.throws(() => parseGitHubSource(input));
  }
});
test("GitHub import selects readme.txt, loads PHP as data, and includes artwork", async () => {
  const { calls, fetcher } = fakeRepository();
  const plugin = await loadGitHubPlugin(source, { fetcher });
  assert.equal(plugin.filename, "readme.txt");
  assert.equal(plugin.headers.Version, "1.0");
  assert.ok(plugin.assets["icon.svg"]);
  assert.ok(!calls.some(({ url }) => url.endsWith("README.md")));
  assert.ok(calls.every(({ options }) => options.credentials === "omit"));
});
test("private and incomplete repositories fail before files can be imported", async () => {
  for (const options of [{ privateRepo: true }, { truncated: true }]) {
    const fixture = fakeRepository(options);
    await assert.rejects(loadGitHubPlugin(source, fixture), /public|too large/);
    assert.ok(
      !fixture.calls.some(({ url }) =>
        url.includes("raw.githubusercontent.com"),
      ),
    );
  }
  await assert.rejects(
    loadGitHubPlugin(source, {
      fetcher: async () => new Response("Limited", { status: 403 }),
    }),
    /request limit/,
  );
});
test("comments escape untrusted Markdown, HTML, and mentions", () => {
  const body = makeComment(source, [
    ["warn", "<img src=x> @someone [click](javascript:evil)\n# pretend"],
    ["good", "Header matches."],
  ]);
  assert.match(body, /1 passed · 1 warning/);
  assert.ok(body.includes(githubPreviewURL(source)));
  assert.ok(
    !body.includes("<img") &&
      !body.includes("@someone") &&
      !body.includes("[click]("),
  );
  assert.match(makeComment(source, [], "Import failed"), /could not finish/);
});
test("comments update the action's existing comment and ignore stale runs", async () => {
  const writes = [];
  const api = async (path, options) => {
    if (options) {
      writes.push({ path, ...options });
      return { html_url: "comment" };
    }
    if (path.includes("/pulls/")) return { head: { sha }, state: "open" };
    return [
      { id: 4, user: { login: "someone" }, body: commentMarker("") },
      {
        id: 7,
        user: { login: "github-actions[bot]" },
        body: commentMarker(""),
      },
    ];
  };
  await publishComment({
    api,
    baseRepo: "owner/plugin",
    number: 3,
    sha,
    path: "",
    body: "New feedback",
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, "PATCH");
  assert.match(writes[0].path, /comments\/7$/);
  const skipped = await publishComment({
    api,
    baseRepo: "owner/plugin",
    number: 3,
    sha: "b".repeat(40),
    path: "",
    body: "Stale",
  });
  assert.equal(skipped.skipped, true);
  assert.equal(writes.length, 1);
});
test("first report creates one comment; plugin subfolders have separate markers", async () => {
  const calls = [];
  await publishComment({
    api: async (path, options) => {
      calls.push({ path, options });
      return options
        ? {}
        : path.includes("/pulls/")
          ? { head: { sha }, state: "open" }
          : [];
    },
    baseRepo: "owner/plugin",
    number: 3,
    sha,
    path: "one",
    body: "Feedback",
  });
  assert.equal(calls.at(-1).options.method, "POST");
  assert.notEqual(commentMarker("one"), commentMarker("two"));
});
test("the shared preflight report counts a long short description only once", () => {
  const checks = collectPreflight({
    short_description_length: 151,
    warnings: { trimmed_short_description: true },
    tags: [],
    sections: {},
    screenshots: [],
    preflight_checks: [],
  });
  assert.equal(checks.filter(([type]) => type === "warn").length, 1);
  assert.ok(
    !checks.some(
      ([type, message]) =>
        type === "good" && /PHP header|Banner|icon/.test(message),
    ),
  );
});
