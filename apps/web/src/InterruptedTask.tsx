import { useEffect, useState } from "react";
import { api, credentials, local } from "./platform.ts";
import { useApp } from "./context.tsx";
import { Field, Modal, Failure } from "./components.tsx";

export function InterruptedTask() {
  const app = useApp();
  const s = app.runtime.state!;
  const [ports, setPorts] = useState<{ name: string }[]>([]);
  const [port, setPort] = useState(app.runtime.port || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [choice, setChoice] = useState<"" | "continue" | "discard">("");
  const [confirmed, setConfirmed] = useState(false);
  const discarding = s.phase === "discarding";
  const loadPorts = async () => {
    const result = await local<{ ports: { name: string }[] }>("ports");
    setPorts(result.ports);
    setPort(
      (previous) =>
        previous || (result.ports.length === 1 ? result.ports[0].name : ""),
    );
  };
  useEffect(() => {
    void loadPorts().catch(setError);
  }, []);
  const perform = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      void app.refresh().catch(() => {});
    }
  };
  const choose = (value: "continue" | "discard") => {
    setChoice(value);
    setConfirmed(false);
    setError(undefined);
  };
  return (
    <section className="panel" aria-label="中断处理">
      <h2>{discarding ? "正在结束此次分药" : "分药已中断"}</h2>
      <p>
        {discarding
          ? "正在删除本次任务和设备反馈。若连接资料服务失败，可重试完成删除。"
          : "已有进度已保留。可重新连接原摆药机，核对现场后继续；也可结束此次分药并删除本次记录。"}
      </p>
      {!discarding && app.runtime.mode === "serial" && (
        <div className="actions">
          <select
            aria-label="重连串口"
            value={port}
            disabled={busy}
            onChange={(e) => setPort(e.target.value)}
          >
            <option value="">选择原摆药机的串口</option>
            {port && !ports.some((p) => p.name === port) && (
              <option value={port}>{port}</option>
            )}
            {ports.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <button disabled={busy} onClick={() => perform(loadPorts)}>
            刷新串口
          </button>
          <button
            disabled={busy || !port}
            onClick={() => perform(() => app.action("connect", { port }))}
          >
            尝试重连
          </button>
        </div>
      )}
      {!discarding && (
        <p className="hint">
          {s.connected
            ? "端口已打开，请核对机器、药盒及当前药物的进度。机器断电、复位或进度不明时，请使用人工核对处理。"
            : "硬件尚未连接。结束此次分药无需连接硬件，但需要连接资料服务以删除已同步记录。"}
        </p>
      )}
      <div className="actions">
        {!discarding && s.phase === "interrupted" && (
          <button
            className="primary"
            disabled={busy || !s.connected}
            onClick={() => choose("continue")}
          >
            继续分药
          </button>
        )}
        <button disabled={busy} onClick={() => choose("discard")}>
          {discarding ? "重试结束并删除" : "结束此次分药（不记录）"}
        </button>
      </div>
      <Failure error={error} />
      {choice && (
        <Modal
          title={
            choice === "continue" ? "核对后继续分药" : "结束并删除此次分药"
          }
          close={() => {
            if (!busy) setChoice("");
          }}
        >
          <p>
            {choice === "continue"
              ? "只恢复当前药物，不重新发送数量矩阵。请确认机器未断电或复位，仍保留当前批次进度，原药盒和药物未更换。无法确认时，请返回人工核对。"
              : "将删除本次任务、摆药结果及设备反馈，不计入已完成覆盖，删除后无法在软件中恢复。本操作不控制机器，也不会开仓或收回轨道。"}
          </p>
          <Field label={choice === "continue" ? "现场核对" : "现场处理"}>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {choice === "continue"
                ? "已确认原批次进度仍保留，可以继续"
                : "已停止投料、确认机器安全停稳，并已妥善处理药盒和药物；确认删除本次全部记录"}
            </label>
          </Field>
          <Failure error={error} />
          <footer>
            <button
              className="primary"
              disabled={busy || !confirmed}
              onClick={() =>
                perform(async () => {
                  if (choice === "continue") {
                    await app.action("continueInterrupted", {
                      taskId: s.taskId,
                      batchId: s.plan.batches[s.batchIndex].id,
                      progressRetained: true,
                    });
                  } else {
                    // Central deletion is idempotent; local intent survives a failed request
                    // or restart, and prevents any further machine commands in between.
                    await local("prepareDiscard", {
                      taskId: s.taskId,
                      confirmed: true,
                    });
                    await api(`/tasks/${s.taskId}/discard`, {
                      terminalId: credentials.terminal,
                      confirmed: true,
                    });
                    await local("finishDiscard", {
                      taskId: s.taskId,
                      confirmed: true,
                    });
                    app.notify("此次分药已结束，任务和设备反馈已删除。");
                  }
                  setChoice("");
                })
              }
            >
              {busy
                ? "处理中…"
                : choice === "continue"
                  ? "确认继续分药"
                  : "确认结束并删除全部记录"}
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
