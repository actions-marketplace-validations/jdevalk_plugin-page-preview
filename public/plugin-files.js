export const assetPattern =
  /^(?:banner-(?:772x250|1544x500)|icon(?:-(?:128x128|256x256))?|screenshot-\d+)\.(?:png|jpe?g|gif|webp|svg)$/i;
const directory = (file) =>
  (file.webkitRelativePath || file.name).split("/").slice(0, -1).join("/");

export function headersFrom(source) {
  const headers = {};
  for (const key of [
    "Plugin Name",
    "Description",
    "Plugin URI",
    "Version",
    "Author",
    "Author URI",
    "Requires at least",
    "Requires PHP",
  ]) {
    const match = source
      .slice(0, 8192)
      .match(new RegExp(`^[ \\t/*#@]*${key}:[ \\t]*(.*)$`, "mi"));
    if (match) headers[key] = match[1].replace(/\s*\*\/.*$/, "").trim();
  }
  return headers;
}

async function fileData(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  const extension = file.name.split(".").pop().toLowerCase();
  const mime = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  }[extension];
  return `data:${mime};base64,${btoa(chunks.join(""))}`;
}

export async function readPluginFiles(
  files,
  { assetsOnly = false, existingAssets = {} } = {},
) {
  const list = Array.from(files);
  const readmes = list
    .filter((file) => /^readme\.(txt|md)$/i.test(file.name))
    .sort(
      (a, b) =>
        directory(a).split("/").length - directory(b).split("/").length ||
        Number(/\.md$/i.test(a.name)) - Number(/\.md$/i.test(b.name)),
    );
  const readme = readmes[0];
  if (!assetsOnly && !readme)
    throw new Error(
      "No readme.txt or README.md found. Choose the plugin root folder or a readme file.",
    );
  if (
    !assetsOnly &&
    readmes.some(
      (file) =>
        directory(file) !== directory(readme) &&
        directory(file).split("/").length ===
          directory(readme).split("/").length,
    )
  )
    throw new Error(
      "More than one plugin found. Choose a single plugin folder.",
    );
  if (readme?.size > 524288)
    throw new Error("Choose a readme smaller than 512 KB.");
  const folder = readme ? directory(readme) : "";
  const assetFolders = [`${folder}/.wordpress-org`, `${folder}/assets`];
  if (folder.endsWith("/trunk"))
    assetFolders.push(folder.replace(/\/trunk$/, "/assets"));
  if (/\/tags\/[^/]+$/.test(folder))
    assetFolders.push(folder.replace(/\/tags\/[^/]+$/, "/assets"));
  const images = list.filter(
    (file) =>
      assetPattern.test(file.name) &&
      (assetsOnly ||
        !file.webkitRelativePath ||
        assetFolders.includes(directory(file))),
  );
  if (
    images.some((file) => file.size > 8 * 1024 * 1024) ||
    images.reduce((sum, file) => sum + file.size, 0) > 24 * 1024 * 1024
  )
    throw new Error(
      "Use images under 8 MB each, with a combined size under 24 MB.",
    );
  const assets = {
    ...(assetsOnly ? existingAssets : {}),
    ...Object.fromEntries(
      await Promise.all(
        images.map(async (file) => [
          file.name.toLowerCase(),
          await fileData(file),
        ]),
      ),
    ),
  };
  if (
    Object.values(assets).reduce(
      (sum, url) => sum + url.slice(url.indexOf(",") + 1).length * 0.75,
      0,
    ) >
    24 * 1024 * 1024
  )
    throw new Error(
      "The combined images exceed 24 MB. Open the plugin again to replace its assets.",
    );
  if (assetsOnly) return { assets };
  let headers = {};
  for (const file of list.filter(
    (file) =>
      /\.php$/i.test(file.name) &&
      file.size < 2 * 1024 * 1024 &&
      directory(file) === folder,
  )) {
    const candidate = headersFrom(await file.slice(0, 8192).text());
    if (candidate["Plugin Name"]) {
      headers = candidate;
      break;
    }
  }
  return {
    readme: await readme.text(),
    filename: readme.name,
    assets,
    headers,
    label: folder || readme.name,
  };
}
