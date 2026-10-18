// Browser development adapter only. Production Windows IPC stays inside the desktop host.
import Fastify from "fastify";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
const runtimePath = existsSync(
  "native/target/release/pillxa-machine-runtime.exe",
)
  ? "native/target/release/pillxa-machine-runtime.exe"
  : "native/target/debug/pillxa-machine-runtime.exe";
const runtime = spawn(
  runtimePath,
  [process.env.PILLXA_RUNTIME_DATABASE || ".var/browser-runtime.sqlite"],
  {
    windowsHide: true,
    stdio: ["pipe", "pipe", "inherit"],
  },
);
let sequence = 0;
const pending = new Map<
  number,
  { resolve(v: unknown): void; reject(e: unknown): void }
>();
createInterface({ input: runtime.stdout }).on("line", (line) => {
  try {
    const result = JSON.parse(line);
    const entry = pending.get(result.id);
    pending.delete(result.id);
    if (result.error) entry?.reject(new Error(result.error));
    else entry?.resolve(result.result);
  } catch {}
});
runtime.on("exit", () => {
  for (const entry of pending.values())
    entry.reject(new Error("本机程序已停止"));
  pending.clear();
});
const app = Fastify();
app.setErrorHandler((error, request, reply) =>
  reply
    .code(400)
    .send({ message: error instanceof Error ? error.message : String(error) }),
);
app.post<{ Params: { method: string } }>(
  "/local/:method",
  async (request) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      runtime.stdin.write(
        JSON.stringify({
          id,
          method: request.params.method,
          params: request.body || {},
        }) + "\n",
      );
    }),
);
await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.PILLXA_BRIDGE_PORT || 4311),
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    runtime.kill();
    app.close().then(() => process.exit());
  });
