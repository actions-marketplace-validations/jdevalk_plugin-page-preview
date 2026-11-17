import { createHash } from "node:crypto";
import { summarizeChecks } from "../public/preflight.js";
import { githubPreviewURL } from "../public/github-source.js";

// Header values are untrusted PR text, not comment Markdown or mentions.
const safe = (value) =>
  String(value)
    .slice(0, 1000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/@/g, "&#64;")
    .replace(/[\\`*_{}\[\]()#!|]/g, "\\$&")
    .replace(/[\r\n]+/g, " ");
export const commentMarker = (path) =>
  `<!-- plugin-page-preview:${createHash("sha256").update(path).digest("hex").slice(0, 16)} -->`;
export function makeComment(source, checks, error) {
  const summary = summarizeChecks(checks);
  const lines = [
    commentMarker(source.path),
    "## Plugin readme preview",
    "",
    `[Open preview](${githubPreviewURL(source)}) · Commit \`${source.ref.slice(0, 7)}\``,
    "",
  ];
  if (error)
    lines.push(
      `⚠️ Preflight could not finish: ${safe(error)}`,
      "",
      "The preview link uses this exact commit. Fix the import issue or rerun the action.",
    );
  else {
    lines.push(
      `**${summary.passed} passed · ${summary.warnings} warning${summary.warnings === 1 ? "" : "s"} · ${summary.notes} note${summary.notes === 1 ? "" : "s"}**`,
      "",
    );
    for (const [type, label, limit] of [
      ["warn", "Warnings", 40],
      ["info", "Notes", 20],
      ["good", "Passed checks", 40],
    ]) {
      const selected = checks.filter(([kind]) => kind === type);
      if (!selected.length) continue;
      if (type !== "warn")
        lines.push(
          "<details>",
          `<summary>${label} (${selected.length})</summary>`,
          "",
        );
      else lines.push("### Warnings", "");
      lines.push(
        ...selected.slice(0, limit).map(([, message]) => `- ${safe(message)}`),
      );
      if (selected.length > limit)
        lines.push(
          `- ${selected.length - limit} more results. Open the preview for the full list.`,
        );
      if (type !== "warn") lines.push("", "</details>");
      lines.push("");
    }
  }
  lines.push(
    "",
    "Readme and PHP-header checks only; this does not test plugin runtime compatibility.",
  );
  return lines.join("\n").slice(0, 64000);
}

export async function publishComment({
  api,
  baseRepo,
  number,
  sha,
  path,
  body,
}) {
  // Avoid an older concurrent run overwriting feedback for the latest head.
  const latest = await api(`/repos/${baseRepo}/pulls/${number}`);
  if (latest.head.sha !== sha || latest.state !== "open")
    return { skipped: true };
  let previous;
  for (let page = 1; page <= 20; page++) {
    const comments = await api(
      `/repos/${baseRepo}/issues/${number}/comments?per_page=100&page=${page}`,
    );
    previous = comments.find(
      (comment) =>
        comment.user?.login === "github-actions[bot]" &&
        comment.body?.startsWith(commentMarker(path)),
    );
    if (previous || comments.length < 100) break;
    if (page === 20)
      throw new Error(
        "Comment history is too large to safely locate the existing preview comment.",
      );
  }
  return previous
    ? api(`/repos/${baseRepo}/issues/comments/${previous.id}`, {
        method: "PATCH",
        body: { body },
      })
    : api(`/repos/${baseRepo}/issues/${number}/comments`, {
        method: "POST",
        body: { body },
      });
}
