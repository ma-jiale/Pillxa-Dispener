import test from "node:test";
import assert from "node:assert/strict";
import { createSettledGateSender } from "../../apps/web/src/settledGateSender.ts";
function clock() {
  let jobs: (() => void)[] = [];
  return {
    schedule: (callback: () => void) => {
      jobs.push(callback);
      return () => {
        jobs = jobs.filter((job) => job !== callback);
      };
    },
    tick: () => {
      const due = jobs;
      jobs = [];
      due.forEach((job) => job());
    },
  };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
test("continuous movement sends only the settled value; release sends immediately", async () => {
  const time = clock();
  const sent: number[] = [];
  const sender = createSettledGateSender({
    send: async (value) => {
      sent.push(value);
    },
    status: () => {},
    schedule: time.schedule,
  });
  assert.deepEqual(sent, []);
  sender.change(0.2);
  sender.change(0.3);
  sender.change(0.4);
  assert.deepEqual(sent, []);
  time.tick();
  await settle();
  assert.deepEqual(sent, [0.4]);
  sender.change(0.5);
  sender.flush();
  await settle();
  time.tick();
  assert.deepEqual(sent, [0.4, 0.5]);
  sender.change(0.5);
  time.tick();
  await settle();
  assert.deepEqual(sent, [0.4, 0.5]);
});
test("adjustments during an in-flight send retain only the latest value and remain serialized", async () => {
  const time = clock();
  const sent: number[] = [];
  const completions: (() => void)[] = [];
  const sender = createSettledGateSender({
    send: (value) => {
      sent.push(value);
      return new Promise<void>((resolve) => completions.push(resolve));
    },
    status: () => {},
    schedule: time.schedule,
  });
  sender.change(0.1);
  sender.flush();
  sender.change(0.2);
  sender.change(0.3);
  time.tick();
  assert.deepEqual(sent, [0.1]);
  completions.shift()!();
  await settle();
  assert.deepEqual(sent, [0.1, 0.3]);
  sender.change(0.4);
  completions.shift()!();
  await settle();
  assert.deepEqual(sent, [0.1, 0.3]);
  time.tick();
  assert.deepEqual(sent, [0.1, 0.3, 0.4]);
  completions.shift()!();
  await settle();
});
test("invalid input, disconnect cancellation and leaving the page do not dispatch pending adjustments", async () => {
  const time = clock();
  const sent: number[] = [];
  const sender = createSettledGateSender({
    send: async (value) => {
      sent.push(value);
    },
    status: () => {},
    schedule: time.schedule,
  });
  sender.change(0.2);
  sender.cancel();
  time.tick();
  await settle();
  assert.deepEqual(sent, []);
  sender.change(0.3);
  sender.dispose();
  time.tick();
  sender.flush();
  sender.change(0.4);
  assert.deepEqual(sent, []);
});
test("failure does not retry by itself; a new adjustment can retry the same value", async () => {
  const time = clock();
  const sent: number[] = [];
  const states: string[] = [];
  const sender = createSettledGateSender({
    send: async (value) => {
      sent.push(value);
      if (sent.length === 1) throw new Error("disconnected");
    },
    status: (value) => states.push(value.phase),
    schedule: time.schedule,
  });
  sender.change(0.2);
  time.tick();
  await settle();
  assert.equal(states.at(-1), "error");
  time.tick();
  assert.deepEqual(sent, [0.2]);
  sender.change(0.2);
  time.tick();
  await settle();
  assert.deepEqual(sent, [0.2, 0.2]);
  assert.equal(states.at(-1), "sent");
});
