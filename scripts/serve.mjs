/** Development convenience only: serves the built static directory; no API. */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const headersText = await readFile(path.join(root, "_headers"), "utf8");
const commonHeaders = Object.fromEntries(
  headersText
    .split("\n\n")[0]
    .split("\n")
    .filter((line) => line.startsWith("  "))
    .map((line) => {
      const at = line.indexOf(":");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
};
const compressed = new Map();
const server = http.createServer(async (req, res) => {
  for (const [name, value] of Object.entries(commonHeaders))
    res.setHeader(name, value);
  res.setHeader("Cache-Control", "no-cache");
  const host = req.headers.host;
  if (
    ![
      `localhost:${server.address().port}`,
      `127.0.0.1:${server.address().port}`,
    ].includes(host)
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }
  try {
    const requestPath = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const relative = requestPath === "/" ? "index.html" : requestPath.slice(1);
    if (
      relative.split("/").some((part) => part.startsWith(".")) ||
      relative.includes("\\") ||
      relative === "_headers"
    )
      throw new Error("Not found");
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root + path.sep)) throw new Error("Not found");
    const info = await stat(filename);
    if (!info.isFile()) throw new Error("Not found");
    let data = await readFile(filename);
    res.setHeader(
      "Content-Type",
      mime[path.extname(filename)] || "application/octet-stream",
    );
    if (relative.startsWith("assets/"))
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Vary", "Accept-Encoding");
    if (
      /\bgzip\b/.test(req.headers["accept-encoding"] || "") &&
      data.length > 1024
    ) {
      const key = `${filename}:${info.mtimeMs}`;
      if (!compressed.has(key)) compressed.set(key, gzipSync(data));
      data = compressed.get(key);
      res.setHeader("Content-Encoding", "gzip");
    }
    res.setHeader("Content-Length", data.length);
    res.writeHead(200);
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});
server.listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
  console.log(
    `Plugin Page Preview: http://127.0.0.1:${server.address().port}\nListening on port ${server.address().port}`,
  ),
);
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "Port is in use. Set PORT=4174 to use another port."
      : error.message,
  );
  process.exitCode = 1;
});
