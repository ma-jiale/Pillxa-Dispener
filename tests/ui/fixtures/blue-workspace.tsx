import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defaultSettings } from "../../../packages/contracts/src/model.ts";
import { createRoot } from "react-dom/client";
import { Execute } from "../../../apps/web/src/Execute.tsx";
import { Context } from "../../../apps/web/src/context.tsx";
import "../../../apps/web/src/styles.css";
// Isolated rendering of the actual workbench; actions do not contact services or devices.
const context = {
  workspace: {
    institution: {
      id: "fixture-institution",
      name: "界面验证机构",
      settings: defaultSettings,
    },
    residents: [],
    tasks: [],
    prescriptions: [],
  },
  runtime: {
    mode: "simulator",
    online: true,
    state: {
      taskId: "fixture",
      phase: new URLSearchParams(location.search).get("phase") || "ready",
      hasStarted: new URLSearchParams(location.search).get("phase") !== null,
      boxPrepared: true,
      connected: true,
      identifiedResidentId: "fixture-resident",
      identificationSources: {},
      batchIndex: 0,
      count: 0,
      pendingSync: 0,
      deviceId: "界面测试机器",
      plan: {
        residentId: "fixture-resident",
        resident: { name: "测试住民", bed: "201-1" },
        startDate: "2026-10-05",
        endDate: "2026-10-11",
        dates: Array.from(
          { length: 7 },
          (_, i) => `2026-10-${String(i + 5).padStart(2, "0")}`,
        ),
        rows: ["morning", "noon", "evening"],
        trays: [{ number: 0, label: "常规药盘" }],
        batches: [
          {
            id: "fixture-batch",
            name: "测试药物",
            specification: "界面样例",
            form: "whole",
            tray: 0,
            target: 7,
            parameters: { gate: 0.7 },
            matrix: [
              [1, 1, 1, 1, 1, 1, 1],
              [0, 0, 0, 0, 0, 0, 0],
              [0, 0, 0, 0, 0, 0, 0],
            ],
          },
        ],
      },
    },
  },
  user: { role: "platform" },
  action: async () => {},
  refresh: async () => {},
  notify: () => {},
} as any;
function Preview() {
  const [cache] = React.useState(() => new QueryClient());
  const [runtime, setRuntime] = React.useState(context.runtime);
  const [notice, setNotice] = React.useState("");
  const [requests, setRequests] = React.useState<number[]>([]);
  const [actions, setActions] = React.useState<string[]>([]);
  return (
    <QueryClientProvider client={cache}>
      <Context.Provider
        value={{
          ...context,
          runtime,
          notify: setNotice,
          action: async (method: string, params: any) => {
            setActions((values) => [...values, method]);
            if (["skip", "manual", "unknown"].includes(method)) {
              setRuntime((old: any) => ({
                ...old,
                state: { ...old.state, phase: "take_out" },
              }));
            }
            if (method === "setGate") {
              setRequests((values) => [...values, params.value]);
              setRuntime({
                ...runtime,
                state: {
                  ...runtime.state,
                  gateValue: params.value,
                  gateOverrides: { [params.batchId]: params.value },
                },
              });
            }
          },
        }}
      >
        <aside className="sidebar">
          <div className="brand">
            <h2>Pillxai Dispenser</h2>
          </div>
          <nav aria-label="主导航">
            <button>总览</button>
            <button className="active">摆药工作台</button>
            <button>住民与用药</button>
            <button>记录</button>
            <button>设置</button>
          </nav>
        </aside>
        <main className="main">
          <div className="content">
            <Execute />
            <p role="status">{notice}</p>
            <p data-testid="gate-requests">
              发送次数：{requests.length}；值：{requests.join(",")}
            </p>
            <p data-testid="action-requests">操作：{actions.join(",")}</p>
          </div>
        </main>
      </Context.Provider>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
