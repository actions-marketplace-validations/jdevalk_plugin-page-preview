import test from "node:test";
import assert from "node:assert/strict";
import { BrowserParser } from "../public/parser-client.js";

class Worker {
  messages = [];
  terminated = false;
  postMessage(message) {
    this.messages.push(message);
  }
  emit(data) {
    this.onmessage({ data });
  }
  terminate() {
    this.terminated = true;
  }
}
const outcome = (promise) =>
  promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
function setup(options = {}) {
  const workers = [];
  const parser = new BrowserParser({
    workerFactory: () => {
      const worker = new Worker();
      workers.push(worker);
      return worker;
    },
    ...options,
  });
  return { parser, workers };
}
test("rapid initial edits load once and parse only the newest text", async () => {
  const { parser, workers } = setup();
  const first = outcome(parser.parse("First"));
  const second = outcome(parser.parse("Second"));
  const third = parser.parse("Third");
  assert.equal(workers.length, 1);
  workers[0].emit({ type: "ready" });
  assert.deepEqual(workers[0].messages.map((m) => m.readme).filter(Boolean), [
    "Third",
  ]);
  workers[0].emit({ type: "result", id: 3, result: { name: "Third" } });
  assert.equal((await first).error.name, "AbortError");
  assert.equal((await second).error.name, "AbortError");
  assert.deepEqual(await third, { name: "Third" });
  parser.dispose();
});
test("in-flight PHP is serialized and superseded results never resolve", async () => {
  const { parser, workers } = setup();
  const first = outcome(parser.parse("First"));
  workers[0].emit({ type: "ready" });
  const second = outcome(parser.parse("Second"));
  const third = parser.parse("Third");
  assert.equal(workers[0].messages.length, 2);
  workers[0].emit({ type: "result", id: 1, result: { name: "First" } });
  assert.equal(workers[0].messages.at(-1).readme, "Third");
  workers[0].emit({ type: "result", id: 3, result: { name: "Third" } });
  assert.equal((await first).error.name, "AbortError");
  assert.equal((await second).error.name, "AbortError");
  assert.deepEqual(await third, { name: "Third" });
  parser.dispose();
});
test("clearing input cancels work without discarding the loaded runtime", async () => {
  const { parser, workers } = setup();
  const first = outcome(parser.parse("First"));
  parser.cancel();
  workers[0].emit({ type: "ready" });
  assert.equal(workers[0].messages.length, 1);
  assert.equal((await first).error.name, "AbortError");
  const next = parser.parse("Next");
  assert.equal(workers.length, 1);
  workers[0].emit({ type: "result", id: 2, result: { name: "Next" } });
  await next;
  parser.dispose();
});
test("startup failure can be retried with a fresh worker", async () => {
  const { parser, workers } = setup();
  const first = outcome(parser.parse("First"));
  workers[0].emit({ type: "startup-error" });
  assert.match((await first).error.message, /could not load/);
  assert.ok(workers[0].terminated);
  const next = parser.parse("Next");
  workers[0].emit({ type: "ready" });
  assert.equal(workers[1].messages.length, 1);
  workers[1].emit({ type: "ready" });
  workers[1].emit({ type: "result", id: 2, result: { name: "Next" } });
  await next;
  parser.dispose();
});
test("parse timeout terminates PHP instead of leaving the UI stuck", async () => {
  const { parser, workers } = setup({ parseTimeout: 15 });
  const first = outcome(parser.parse("First"));
  workers[0].emit({ type: "ready" });
  assert.match((await first).error.message, /Parsing took too long/);
  assert.ok(workers[0].terminated);
  parser.dispose();
});
test("invalid and oversized pasted input are rejected before loading PHP", async () => {
  const { parser, workers } = setup();
  await assert.rejects(parser.parse("é".repeat(262145)), /512 KB/);
  await assert.rejects(parser.parse(null), /512 KB/);
  assert.equal(workers.length, 0);
  parser.dispose();
});

test("each parse carries the current plugin headers alongside its readme", async () => {
  const { parser, workers } = setup();
  const headers = {
    "Plugin Name": "Admin name",
    Description: "Admin description",
  };
  const pending = parser.parse("Directory name", headers);
  workers[0].emit({ type: "ready" });
  assert.deepEqual(workers[0].messages.at(-1).headers, headers);
  workers[0].emit({ type: "result", id: 1, result: {} });
  await pending;
  parser.dispose();
});
