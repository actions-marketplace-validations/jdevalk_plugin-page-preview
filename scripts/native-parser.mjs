// Runs only the bundled trusted parser; imported plugin PHP is always data.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function parseReadme(readme, headers = {}) {
  if (typeof readme !== "string" || Buffer.byteLength(readme) > 524288) {
    return Promise.reject(
      new Error("Choose a readme.txt smaller than 512 KB."),
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PHP_BINARY || "php",
      ["-d", "memory_limit=128M", path.join(root, "php/parse.php")],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "",
      stderr = "",
      settled = false;
    const done = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      done(new Error("Parsing timed out. Try a smaller readme."));
    }, 10000);
    child.on("error", () =>
      done(
        new Error(
          "PHP could not start. Install PHP 8.1+ with mbstring and sodium, or set PHP_BINARY.",
        ),
      ),
    );
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 4 * 1024 * 1024) {
        child.kill();
        done(new Error("Parser output is too large."));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      if (code !== 0)
        return done(
          new Error(`Unable to parse readme: ${stderr.trim().slice(0, 400)}`),
        );
      try {
        done(null, JSON.parse(stdout));
      } catch {
        done(new Error("The readme parser returned invalid output."));
      }
    });
    child.stdin.end(JSON.stringify({ readme, headers }));
  });
}
