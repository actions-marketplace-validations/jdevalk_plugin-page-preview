import { readFile, appendFile } from "node:fs/promises";
import {
  loadGitHubPlugin,
  parseGitHubSource,
  githubPreviewURL,
} from "../public/github-source.js";
import { collectPreflight, summarizeChecks } from "../public/preflight.js";
import { latestWordPressMajor } from "../public/wordpress-version.js";
import { parseReadme } from "../scripts/native-parser.mjs";
import { makeComment, publishComment } from "./comment.mjs";

async function run() {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  const pr = event.pull_request;
  if (!pr) throw new Error("Run this action on a pull_request_target event.");
  if (event.repository?.private !== false || pr.head.repo?.private !== false)
    throw new Error("This action supports public repositories only.");
  const token = process.env.INPUT_TOKEN;
  if (!token)
    throw new Error(
      "The action needs github.token with pull-requests: write permission.",
    );
  const source = parseGitHubSource({
    repo: pr.head.repo.full_name,
    ref: pr.head.sha,
    path: process.env["INPUT_PLUGIN-PATH"] || "",
  });
  const baseRepo = event.repository.full_name;
  if (baseRepo !== process.env.GITHUB_REPOSITORY)
    throw new Error("The event repository does not match this workflow.");
  const number = pr.number || event.number;
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error("Invalid pull-request number.");
  const api = async (path, { method = "GET", body } = {}) => {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw new Error(
        `GitHub comment request failed (HTTP ${response.status}). Check pull-requests: write permission.`,
      );
    return response.json();
  };
  let checks = [],
    error;
  try {
    const plugin = await loadGitHubPlugin(source, {
      fetcher: (url, options) =>
        fetch(
          url,
          new URL(url).hostname === "api.github.com"
            ? {
                ...options,
                redirect: "error",
                headers: { Authorization: `Bearer ${token}` },
              }
            : options,
        ),
    });
    const parsed = await parseReadme(plugin.readme, plugin.headers);
    let wordpress;
    try {
      wordpress = { status: "ready", major: await latestWordPressMajor() };
    } catch {
      wordpress = { status: "error" };
    }
    checks = collectPreflight(parsed, { ...plugin, wordpress });
  } catch (problem) {
    error = problem.message;
  }
  const result = await publishComment({
    api,
    baseRepo,
    number,
    sha: source.ref,
    path: source.path,
    body: makeComment(source, checks, error),
  });
  if (result.skipped) {
    console.log("Skipped stale or closed pull request.");
    return;
  }
  const summary = summarizeChecks(checks);
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `preview-url=${githubPreviewURL(source)}\nwarnings=${summary.warnings}\ncomment-url=${result.html_url || ""}\n`,
    );
  console.log(
    `Posted readme preview for ${source.repo}@${source.ref.slice(0, 7)}: ${summary.warnings} warnings.`,
  );
  if (error) process.exitCode = 1;
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
