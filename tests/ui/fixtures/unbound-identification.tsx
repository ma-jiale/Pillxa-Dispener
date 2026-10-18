import React from "react";
import { createRoot } from "react-dom/client";
import { Identification } from "../../../apps/web/src/Identification.tsx";
import { Context } from "../../../apps/web/src/context.tsx";
import "../../../apps/web/src/styles.css";
// Isolated visual fixture: no real device, user records, or service requests.
const context = {
  workspace: { residents: [] },
  runtime: {
    mode: "simulator",
    state: {
      taskId: "fixture",
      phase: "ready",
      boxPrepared: true,
      connected: true,
      identifiedResidentId: null,
      identificationIssue: "药盒标识尚未绑定，请在住民资料中完成绑定",
      identificationSources: {
        rfid: { residentId: null, raw: "UID: 0000ab12" },
        barcode: { residentId: null, raw: "BOX:UNBOUND-123" },
      },
      plan: {
        residentId: "fixture-resident",
        resident: { name: "测试住民", bed: "201-1" },
      },
    },
  },
  action: async () => {},
  notify: (text: string) => {
    document.querySelector("#notice")!.textContent = text;
  },
} as any;
createRoot(document.getElementById("root")!).render(
  <Context.Provider value={context}>
    <main style={{ maxWidth: 920, margin: "70px auto", padding: 24 }}>
      <h1>摆药工作台</h1>
      <div className="panel">
        <Identification />
      </div>
      <p id="notice" role="status" />
    </main>
  </Context.Provider>,
);
