import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Failure } from "./components.tsx";
import { createSettledGateSender } from "./settledGateSender.ts";
import type { GateSendStatus } from "./settledGateSender.ts";

/** Device units and bounds come from the confirmed hardware contract. */
export function GateControl({
  initialValue,
  drugName,
  min,
  max,
  step,
  unit,
  connected,
  simulated,
  lastSent,
  apply,
}: {
  initialValue: number;
  drugName: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  connected: boolean;
  simulated: boolean;
  lastSent?: number | null;
  apply(value: number): Promise<void>;
}) {
  const [draft, setDraft] = useState(String(initialValue));
  const [sendStatus, setSendStatus] = useState<GateSendStatus>();
  const latest = useRef({ apply, connected });
  latest.current = { apply, connected };
  const sender = useRef<ReturnType<typeof createSettledGateSender> | null>(
    null,
  );
  useEffect(() => {
    const control = createSettledGateSender({
      send: async (value) => {
        if (!latest.current.connected) throw new Error("设备未连接");
        await latest.current.apply(value);
      },
      status: setSendStatus,
    });
    sender.current = control;
    return () => {
      control.dispose();
      sender.current = null;
    };
  }, []);
  useEffect(() => {
    if (!connected) {
      sender.current?.cancel();
      setSendStatus(undefined);
    }
  }, [connected]);
  const value = Number(draft);
  const valid =
    draft.trim() !== "" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max;
  const change = (text: string) => {
    setDraft(text);
    const next = Number(text);
    if (
      connected &&
      text.trim() &&
      Number.isFinite(next) &&
      next >= min &&
      next <= max
    ) {
      sender.current?.change(next);
    } else {
      sender.current?.cancel();
      setSendStatus(undefined);
    }
  };
  const error =
    sendStatus?.phase === "error"
      ? sendStatus.error
      : !valid && draft.trim()
        ? `请输入 ${min}–${max} 的刻度`
        : undefined;
  return (
    <section className="panel gate-control" aria-label="阀门舵机">
      <div className="gate-control-heading">
        <SlidersHorizontal size={21} />
        <div>
          <h2>出药开口 · {drugName}</h2>
          <p>调整后自动设置。刻度越小，开口越大。</p>
        </div>
        {simulated && <span className="badge amber">模拟操作</span>}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (connected && valid) sender.current?.flush();
        }}
      >
        <div className="gate-control-inputs">
          <span className="range-end">较大开口</span>
          <input
            type="range"
            aria-label="阀门舵机滑块"
            min={min}
            max={max}
            step={step}
            value={valid ? value : min}
            onChange={(event) => change(event.target.value)}
            onPointerUp={() => sender.current?.flush()}
            onBlur={() => sender.current?.flush()}
          />
          <span className="range-end">较小开口</span>
          <label className="gate-control-value">
            <span className="sr-only">阀门舵机数值</span>
            <input
              type="number"
              aria-label="阀门舵机数值"
              required
              min={min}
              max={max}
              step={step}
              value={draft}
              onChange={(event) => change(event.target.value)}
              onBlur={() => sender.current?.flush()}
            />
            <span>{unit}</span>
          </label>
        </div>
        <p className="hint" aria-live="polite" data-testid="gate-send-status">
          {!connected
            ? "请先在设置中连接摆药机。"
            : sendStatus?.phase === "waiting"
              ? "正在调整，停止后自动设置…"
              : sendStatus?.phase === "sending"
                ? `正在${simulated ? "模拟设置" : "设置"}：${sendStatus.value}${unit}…`
                : sendStatus?.phase === "error"
                  ? "设置失败，请重新调整数值重试。"
                  : lastSent == null
                    ? `可调范围 ${min}–${max}${unit}，调整后自动设置。`
                    : `最近${simulated ? "模拟设置" : "设置"}：${lastSent}${unit}。${simulated ? "" : "请以现场阀门位置为准。"}`}
        </p>
        <Failure error={error} />
        <p className="hint">
          仅用于本次药物。需要以后沿用时，请在该用药条目的出药设置中保存。
        </p>
      </form>
    </section>
  );
}
