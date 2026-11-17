/** One browser worker, one active parse, and only the latest pending edit. */
export class BrowserParser {
  constructor({
    workerFactory,
    onStatus = () => {},
    startupTimeout = 60000,
    parseTimeout = 10000,
  } = {}) {
    this.workerFactory =
      workerFactory ||
      (() =>
        new Worker(new URL(__PARSER_WORKER_URL__, import.meta.url), {
          type: "module",
        }));
    this.onStatus = onStatus;
    this.startupTimeout = startupTimeout;
    this.parseTimeout = parseTimeout;
    this.worker = null;
    this.ready = false;
    this.active = null;
    this.queued = null;
    this.id = 0;
    this.timer = null;
  }

  parse(readme, headers = {}) {
    if (
      typeof readme !== "string" ||
      new TextEncoder().encode(readme).length > 524288
    ) {
      return Promise.reject(new Error("Choose a readme smaller than 512 KB."));
    }
    return new Promise((resolve, reject) => {
      this.cancel();
      this.queued = { id: ++this.id, readme, headers, resolve, reject };
      if (!this.worker) this.start();
      else if (this.ready) this.drain();
    });
  }

  cancel() {
    const error = new DOMException(
      "A newer edit replaced this preview.",
      "AbortError",
    );
    this.queued?.reject(error);
    this.queued = null;
    // Let an active PHP request finish before reusing its runtime.
    if (this.active && !this.active.cancelled) {
      this.active.cancelled = true;
      this.active.reject(error);
    }
  }

  start() {
    try {
      this.onStatus("Loading browser parser…");
      const worker = this.workerFactory();
      this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (worker !== this.worker) return;
        if (data.type === "ready") {
          clearTimeout(this.timer);
          this.ready = true;
          this.drain();
        } else if (data.type === "startup-error") {
          this.fail(
            new Error(
              "The browser parser could not load. Check your connection and retry.",
            ),
          );
        } else if (data.id === this.active?.id) {
          clearTimeout(this.timer);
          const job = this.active;
          this.active = null;
          if (!job.cancelled) {
            if (data.type === "result") job.resolve(data.result);
            else
              job.reject(
                new Error(data.error || "The readme could not be parsed."),
              );
          }
          this.drain();
        }
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        if (worker === this.worker)
          this.fail(
            new Error("The browser parser stopped. Retry to restart it."),
          );
      };
      worker.onmessageerror = () =>
        this.fail(
          new Error(
            "The browser parser returned an unreadable response. Please retry.",
          ),
        );
      this.timer = setTimeout(
        () =>
          this.fail(
            new Error(
              "The browser parser took too long to load. Check your connection and retry.",
            ),
          ),
        this.startupTimeout,
      );
      worker.postMessage({ type: "start" });
    } catch {
      this.fail(
        new Error(
          "This browser could not start the parser. Use a current browser over HTTP or HTTPS, then retry.",
        ),
      );
    }
  }

  drain() {
    if (!this.ready || this.active || !this.queued) return;
    this.active = this.queued;
    this.queued = null;
    this.onStatus("Parsing in your browser…");
    this.timer = setTimeout(
      () =>
        this.fail(
          new Error("Parsing took too long. Try a smaller readme or retry."),
        ),
      this.parseTimeout,
    );
    this.worker.postMessage({
      type: "parse",
      id: this.active.id,
      readme: this.active.readme,
      headers: this.active.headers,
    });
  }

  fail(error) {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.active?.reject(error);
    this.queued?.reject(error);
    this.active = this.queued = null;
  }

  dispose() {
    this.fail(new DOMException("Preview closed.", "AbortError"));
  }
}
