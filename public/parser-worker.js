import { PHP, loadPHPRuntime } from "@php-wasm/universal";
import * as loader from "php-runtime";

let php;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "start") {
      const [runtime, files] = await Promise.all([
        loadPHPRuntime(loader),
        fetch(new URL(__PHP_FILES_URL__, import.meta.url), {
          credentials: "omit",
        }).then((response) => {
          if (!response.ok) throw new Error("Parser files unavailable.");
          return response.json();
        }),
      ]);
      php = new PHP(runtime);
      for (const [name, content] of Object.entries(files)) {
        php.mkdir(name.slice(0, name.lastIndexOf("/")));
        php.writeFile(name, content);
      }
      self.postMessage({ type: "ready" });
    } else if (data.type === "parse") {
      if (
        typeof data.readme !== "string" ||
        new TextEncoder().encode(data.readme).length > 524288
      ) {
        throw new Error("Choose a readme smaller than 512 KB.");
      }
      // This is data in the private virtual filesystem, never evaluated as PHP.
      php.writeFile(
        "/input.json",
        JSON.stringify({ readme: data.readme, headers: data.headers }),
      );
      try {
        const response = await php.run({
          code: "<?php ini_set('memory_limit', '128M'); define('STDIN', fopen('/input.json','r')); define('STDERR', fopen('php://stderr','w')); require '/app/php/parse.php';",
        });
        if (response.exitCode !== 0)
          throw new Error(
            "The readme could not be parsed. Check its formatting and try again.",
          );
        self.postMessage({
          type: "result",
          id: data.id,
          result: JSON.parse(response.text),
        });
      } finally {
        php.unlink("/input.json");
      }
    }
  } catch {
    self.postMessage({
      type: data.type === "start" ? "startup-error" : "error",
      id: data.id,
      error:
        "The readme could not be parsed. Check its formatting and try again.",
    });
  }
};
