import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { CheckCircle2, ScanLine } from "lucide-react";
import { useApp } from "./context.tsx";
export function Identification() {
  const { runtime, action, notify, workspace } = useApp();
  const state = runtime.state;
  const latest = useRef({ action, notify, residents: workspace.residents });
  latest.current = { action, notify, residents: workspace.residents };
  const [opening, setOpening] = useState(false);
  const [cameraIssue, setCameraIssue] = useState("");
  const [retry, setRetry] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const enabled =
    !!state?.boxPrepared && !!state.connected && runtime.mode === "serial";
  useEffect(() => {
    if (!enabled || !video.current) return;
    let disposed = false;
    let controls: IScannerControls | undefined;
    // Re-establish video presence after returning to the page, including removal.
    let lastText = "\u0000";
    let lastSeen = Date.now();
    let lastFromVideo = true;
    let submitting = false;
    let keyboardText = "";
    let keyboardAt = 0;
    setCameraIssue("");
    const observe = async (text: string, fromVideo: boolean) => {
      if (disposed) return;
      lastSeen = Date.now();
      lastFromVideo = fromVideo;
      if (text === lastText || submitting) return;
      submitting = true;
      try {
        const residentId = text
          .trim()
          .replace(/^(PX|PID|BOX):/, "")
          .split("|")[0];
        await latest.current.action("identify", {
          taskId: state?.taskId,
          residentId:
            latest.current.residents.some(
              (resident) => resident.id === residentId,
            ) || residentId === state?.plan.residentId
              ? residentId
              : null,
          source: "barcode",
          raw: text,
        });
        lastText = text;
      } catch (error) {
        if (!disposed) latest.current.notify((error as Error).message);
      } finally {
        submitting = false;
      }
    };
    import("@zxing/browser")
      .then(({ BrowserMultiFormatReader }) => {
        if (disposed || !video.current) return;
        return new BrowserMultiFormatReader().decodeFromVideoDevice(
          undefined,
          video.current,
          (result) => {
            if (result) void observe(result.getText(), true);
          },
        );
      })
      .then((control) => {
        if (disposed) control?.stop();
        else controls = control;
      })
      .catch(() => {
        if (!disposed) {
          setCameraIssue("有一项识别设备暂不可用，其余识别仍在等待药盒。");
          if (lastFromVideo) {
            void latest.current
              .action("identifyAbsent", {
                taskId: state?.taskId,
                source: "barcode",
              })
              .catch(() => {});
          }
        }
      });
    // A 2D reader can also provide a decoded label as keystrokes followed by Enter.
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        target?.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      const now = Date.now();
      if (now - keyboardAt > 250) keyboardText = "";
      keyboardAt = now;
      if (event.key === "Enter") {
        if (keyboardText.length >= 6) {
          event.preventDefault();
          void observe(keyboardText, false);
        }
        keyboardText = "";
      } else if (event.key.length === 1) keyboardText += event.key;
    };
    window.addEventListener("keydown", keydown);
    const absence = setInterval(() => {
      if (
        !disposed &&
        controls &&
        lastFromVideo &&
        lastText &&
        !submitting &&
        Date.now() - lastSeen >= 1500
      ) {
        lastText = "";
        void latest.current
          .action("identifyAbsent", {
            taskId: state?.taskId,
            source: "barcode",
          })
          .catch(() => {});
      }
    }, 300);
    return () => {
      disposed = true;
      controls?.stop();
      clearInterval(absence);
      window.removeEventListener("keydown", keydown);
    };
  }, [enabled, state?.taskId, state?.phase, retry]);
  const prepare = async () => {
    setOpening(true);
    try {
      await action("prepareBox");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setOpening(false);
    }
  };
  const matched = !!state?.identifiedResidentId;
  const unboundIdentifiers = Object.entries(state?.identificationSources || {})
    .filter(
      ([source, observation]) =>
        ["rfid", "barcode"].includes(source) &&
        !observation.residentId &&
        observation.raw,
    )
    .map(([source, observation]) =>
      source === "rfid"
        ? observation.raw
            .replace(/^UID\s*:/i, "")
            .replace(/\s/g, "")
            .toUpperCase()
        : observation.raw,
    )
    .filter((value, index, values) => values.indexOf(value) === index);
  const nextTray =
    state?.phase === "tray_change"
      ? state.plan.trays.find(
          (tray) =>
            tray.number === state.plan.batches[state.batchIndex + 1]?.tray,
        )?.label
      : null;
  return (
    <section
      className={`identification ${matched ? "identification-matched" : ""}`}
      aria-label="药盒识别"
    >
      <div className="identification-title">
        {matched ? <CheckCircle2 size={24} /> : <ScanLine size={24} />}
        <div>
          <h2>药盒识别</h2>
          {nextTray && <p>请换入：{nextTray}</p>}
          <p aria-live="polite">
            {state?.identificationIssue ||
              (matched
                ? `已识别：${state.plan.resident.name} · ${state.plan.resident.bed || "未填写床位"}`
                : !state?.connected
                  ? "请先在设置中连接摆药机。"
                  : !state.boxPrepared
                    ? "先开仓，再将药盒放到轨道上。"
                    : "请将药盒放到轨道上，系统会自动识别所属住民。")}
          </p>
        </div>
        <span className={`identification-status ${matched ? "matched" : ""}`}>
          {matched
            ? "核验通过"
            : state?.identificationIssue
              ? "请核对药盒"
              : state?.boxPrepared
                ? "等待放盒"
                : "准备放盒"}
        </span>
      </div>
      {!state?.boxPrepared && (
        <button
          className="primary"
          disabled={opening || !state?.connected}
          onClick={prepare}
        >
          {opening ? "正在请求开仓…" : "开仓，准备放盒"}
        </button>
      )}
      {state?.boxPrepared && !matched && runtime.mode === "simulator" && (
        <button
          onClick={() =>
            action("identify", {
              residentId: state.plan.residentId,
              source: "simulator",
              raw: "simulated-box",
            }).catch((error) => notify(error.message))
          }
        >
          模拟放入本人的药盒
        </button>
      )}
      {state?.identificationIssue && (
        <p className="hint">当前任务保持不变，核验通过后才能开始摆药。</p>
      )}
      {unboundIdentifiers.length > 0 && (
        <div className="unbound-box-identifiers">
          <p>以下药盒标识尚未绑定，可复制到住民资料中绑定：</p>
          {unboundIdentifiers.map((value) => (
            <div className="unbound-box-identifier" key={value}>
              <code aria-label="未绑定药盒标识">{value}</code>
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(value)
                    .then(() => notify("药盒标识已复制"))
                    .catch(() => notify("复制失败，请选中标识手动复制"))
                }
              >
                复制标识
              </button>
            </div>
          ))}
        </div>
      )}
      {cameraIssue && !matched && (
        <div className="identification-help">
          <span>{cameraIssue}</span>
          <button onClick={() => setRetry((value) => value + 1)}>
            重试识别设备
          </button>
        </div>
      )}
      <video
        ref={video}
        className="box-reader-video"
        aria-hidden="true"
        tabIndex={-1}
        muted
        autoPlay
        playsInline
      />
    </section>
  );
}
