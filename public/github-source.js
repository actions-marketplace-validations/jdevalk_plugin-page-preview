import { assetPattern, readPluginFiles } from "./plugin-files.js";

export function parseGitHubRepositoryURL(value) {
  const message = "Use a repository link such as https://github.com/owner/plugin.";
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(message);
  }
  if (
    url.protocol !== "https:" || url.hostname !== "github.com" ||
    url.port || url.username || url.password
  ) throw new Error(message);
  const match = url.pathname.match(/^\/([a-z0-9][a-z0-9-]*)\/([a-z0-9_.-]+)\/?$/i);
  const name = match?.[2].replace(/\.git$/, "");
  if (!name || name === "." || name === "..") throw new Error(message);
  return `${match[1]}/${name}`;
}

export async function resolveGitHubRepository(value, { fetcher = fetch } = {}) {
  const repo = parseGitHubRepositoryURL(value);
  const commits = JSON.parse(await (await boundedFetch(
    `https://api.github.com/repos/${repo}/commits?per_page=1`,
    262144,
    fetcher,
  )).text());
  if (!Array.isArray(commits) || !/^[a-f0-9]{40}$/i.test(commits[0]?.sha || ""))
    throw new Error("GitHub could not find a commit on this repository's default branch.");
  return parseGitHubSource({ repo, ref: commits[0].sha });
}

export function parseGitHubSource({ repo, ref, path = "" }) {
  if (
    !/^[a-z0-9][a-z0-9-]*\/[a-z0-9_.-]+$/i.test(repo || "") ||
    repo.split("/")[1] === ".."
  )
    throw new Error("Use a GitHub repository in owner/repository format.");
  if (!/^[a-f0-9]{40}$/i.test(ref || ""))
    throw new Error("Preview links must use a full commit SHA.");
  path = path.replace(/\/$/, "");
  if (
    path &&
    (path.startsWith("/") ||
      path.split("/").some((p) => !p || p === "." || p === "..") ||
      /[\\\x00-\x1f?#]/.test(path))
  )
    throw new Error(
      "Use a relative plugin folder path without parent-directory segments.",
    );
  return { repo, ref: ref.toLowerCase(), path };
}

async function boundedFetch(url, limit, fetcher) {
  const response = await fetcher(url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 403 || response.status === 429
        ? "GitHub's request limit was reached. Try again later or open the local plugin folder."
        : `GitHub could not load this revision (HTTP ${response.status}). Preview links require a public repository and an available commit.`,
    );
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("A GitHub file exceeds the preview size limit.");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error("A GitHub file exceeds the preview size limit.");
    }
    chunks.push(value);
  }
  return new Blob(chunks);
}

export async function loadGitHubPlugin(source, { fetcher = fetch } = {}) {
  const { repo, ref, path } = parseGitHubSource(source);
  const base = `https://api.github.com/repos/${repo}`;
  const metadata = JSON.parse(
    await (await boundedFetch(base, 262144, fetcher)).text(),
  );
  if (metadata.private !== false)
    throw new Error("Only public GitHub repositories can be previewed.");
  const tree = JSON.parse(
    await (
      await boundedFetch(
        `${base}/git/trees/${ref}?recursive=1`,
        8 * 1024 * 1024,
        fetcher,
      )
    ).text(),
  );
  if (tree.truncated)
    throw new Error(
      "This repository is too large to list completely. Open its local plugin folder instead.",
    );
  if (!Array.isArray(tree.tree))
    throw new Error("GitHub returned an invalid file listing.");
  const prefix = path ? path + "/" : "";
  const folder = (name) => name.split("/").slice(0, -1).join("/");
  const assetFolders = [prefix + ".wordpress-org", prefix + "assets"];
  if (path === "trunk" || path.endsWith("/trunk"))
    assetFolders.push(path.replace(/(^|\/)trunk$/, "$1assets"));
  if (/(^|\/)tags\/[^/]+$/.test(path))
    assetFolders.push(path.replace(/(^|\/)tags\/[^/]+$/, "$1assets"));
  const files = tree.tree.filter(
    (f) =>
      f.type === "blob" && f.mode !== "120000" && typeof f.path === "string",
  );
  const readmes = files
    .filter(
      (f) =>
        folder(f.path) === path &&
        /^readme\.(txt|md)$/i.test(f.path.split("/").at(-1)),
    )
    .sort(
      (a, b) => Number(/\.md$/i.test(a.path)) - Number(/\.md$/i.test(b.path)),
    );
  if (!readmes.length)
    throw new Error("No readme.txt or README.md found in this plugin folder.");
  const selected = [
    readmes[0],
    ...files.filter(
      (f) =>
        (folder(f.path) === path && /\.php$/i.test(f.path)) ||
        (assetFolders.includes(folder(f.path)) &&
          assetPattern.test(f.path.split("/").at(-1))),
    ),
  ];
  if (selected.length > 100)
    throw new Error(
      "Too many plugin files to import. Open the local plugin folder instead.",
    );
  let total = 0;
  const imported = [];
  for (const file of selected) {
    const limit =
      file === readmes[0]
        ? 524288
        : /\.php$/i.test(file.path)
          ? 2 * 1024 * 1024 - 1
          : 8 * 1024 * 1024;
    if (file.size > limit || total + file.size > 32 * 1024 * 1024)
      throw new Error("Plugin files exceed the preview size limits.");
    const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
    const blob = await boundedFetch(
      `https://raw.githubusercontent.com/${repo}/${ref}/${encodedPath}`,
      Math.min(limit, 32 * 1024 * 1024 - total),
      fetcher,
    );
    total += blob.size;
    const importedFile = new File([blob], file.path.split("/").at(-1));
    Object.defineProperty(importedFile, "webkitRelativePath", {
      value: "repository/" + file.path,
    });
    imported.push(importedFile);
  }
  const plugin = await readPluginFiles(imported);
  return {
    ...plugin,
    label: `${repo}${path ? "/" + path : ""} @ ${ref.slice(0, 7)}`,
  };
}

export function githubPreviewURL(source) {
  const checked = parseGitHubSource(source);
  const url = new URL("https://readme.joost.blog/");
  url.searchParams.set("repo", checked.repo);
  url.searchParams.set("ref", checked.ref);
  if (checked.path) url.searchParams.set("path", checked.path);
  return url.href;
}
