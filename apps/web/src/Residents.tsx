import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, FileDown, Pill, SlidersHorizontal } from "lucide-react";
import { useApp } from "./context.tsx";
import { Badge, Empty, Filter, Failure, Busy } from "./components.tsx";
import { ResidentForm, PrescriptionForm, ParameterForm } from "./forms.tsx";
import { LabelExport } from "./LabelExport.tsx";
import { RecordDetail } from "./RecordDetail.tsx";
import { api } from "./platform.ts";
import { taskResult, dateRange } from "./presentation.ts";
import type {
  Resident,
  Prescription,
  Task,
  Permission,
} from "../../../packages/contracts/src/model.ts";
import {
  mealLabels,
  slotLabels,
} from "../../../packages/contracts/src/model.ts";

export function Residents() {
  const { workspace, user } = useApp();
  const can = (permission: Permission) =>
    user.role !== "staff" || user.permissions.includes(permission);
  const [query, setQuery] = useState(""),
    [scope, setScope] = useState("active"),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState("medications"),
    [showStopped, setShowStopped] = useState(false),
    [labels, setLabels] = useState(false);
  const [residentForm, setResidentForm] = useState<
      Resident | null | undefined
    >(),
    [rxForm, setRxForm] = useState<Prescription | null | undefined>(),
    [parameter, setParameter] = useState<Prescription>(),
    [record, setRecord] = useState<Task>();
  const list = workspace.residents.filter(
    (r) =>
      `${r.name} ${r.bed}`.includes(query.trim()) &&
      (scope === "all" || r.active === (scope === "active")),
  );
  const resident = list.find((r) => r.id === selected) || list[0];
  const prescriptions = workspace.prescriptions.filter(
    (r) => r.residentId === resident?.id,
  );
  const history = useQuery({
    queryKey: ["resident-history", workspace.institution.id, resident?.id],
    queryFn: () =>
      api<{ items: Task[]; nextCursor?: string }>(
        `/records?residentId=${encodeURIComponent(resident!.id)}`,
      ),
    enabled: !!resident && tab === "history",
  });
  const drugRow = (rx: Prescription) => (
    <article className="medication-row" key={rx.id}>
      <div className="medication-identity">
        <span className="drug-icon">
          {rx.image ? <img src={rx.image} alt={rx.name} /> : <Pill size={20} />}
        </span>
        <div>
          <h3>{rx.name}</h3>
          <p>
            {rx.specification} · {mealLabels[rx.meal]}
          </p>
          <small>
            {rx.form === "half" ? "预切半片" : "整片"} ·{" "}
            {rx.endDate ? `${rx.startDate} — ${rx.endDate}` : "长期用药"}
          </small>
        </div>
      </div>
      <div className="dose-strip">
        {workspace.institution.settings.rows.map((slot) => (
          <div key={slot}>
            <small>{slotLabels[slot]}</small>
            <strong>{rx.doses[slot] ? `${rx.doses[slot]} 片` : "—"}</strong>
          </div>
        ))}
      </div>
      <div className="medication-actions">
        {rx.parameters.needsCalibration && can("parameters") && (
          <span className="attention-text">出药设置待调整</span>
        )}
        {can("prescriptions") && (
          <button
            className="icon"
            aria-label={`编辑${rx.name}用药`}
            onClick={() => setRxForm(rx)}
          >
            <Pencil size={17} />
          </button>
        )}
        {can("parameters") && (
          <details className="more-menu">
            <summary aria-label={`${rx.name}更多操作`}>···</summary>
            <div>
              <button onClick={() => setParameter(rx)}>
                <SlidersHorizontal size={15} />
                出药设置
              </button>
            </div>
          </details>
        )}
      </div>
    </article>
  );
  return (
    <>
      <div className="page-title">
        <div>
          <h1>住民与用药</h1>
          <p>查找住民，维护每一份用药安排。</p>
        </div>
        <div className="actions">
          <button
            onClick={() => setLabels(true)}
            disabled={!workspace.residents.some((r) => r.active)}
          >
            <FileDown size={17} />
            导出标签
          </button>
          {can("residents") && (
            <button className="primary" onClick={() => setResidentForm(null)}>
              <Plus size={17} />
              添加住民
            </button>
          )}
        </div>
      </div>
      <div className="resident-layout">
        <section className="resident-list panel">
          <Filter value={query} change={setQuery} />
          <div className="segmented resident-scope">
            {[
              ["active", "在院"],
              ["inactive", "已离院"],
              ["all", "全部"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={scope === id}
                className={scope === id ? "selected" : ""}
                onClick={() => setScope(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="list-count">{list.length} 位住民</div>
          <div className="resident-directory">
            {list.map((r) => (
              <button
                className={`resident-row${resident?.id === r.id ? " selected" : ""}`}
                key={r.id}
                aria-pressed={resident?.id === r.id}
                onClick={() => {
                  setSelected(r.id);
                  setShowStopped(false);
                }}
              >
                <span className="avatar">
                  {r.photo ? <img src={r.photo} alt="" /> : r.name.slice(-2)}
                </span>
                <span>
                  <strong>{r.name}</strong>
                  <small>{r.bed || "未填写床位"}</small>
                </span>
                {!r.active && <Badge>已离院</Badge>}
              </button>
            ))}
            {!list.length && (
              <Empty>{query ? "没有找到匹配住民" : "当前列表没有住民"}</Empty>
            )}
          </div>
        </section>
        <section className="resident-detail">
          {resident ? (
            <>
              <div className="panel resident-profile">
                <div className="resident-heading">
                  <span className="avatar large">
                    {resident.photo ? (
                      <img src={resident.photo} alt="" />
                    ) : (
                      resident.name.slice(-2)
                    )}
                  </span>
                  <div>
                    <h2>{resident.name}</h2>
                    <p>
                      {resident.bed || "未填写床位"}
                      <span className="inline-divider">·</span>
                      {resident.active ? "在院" : "已离院"}
                    </p>
                  </div>
                  {can("residents") && (
                    <button onClick={() => setResidentForm(resident)}>
                      <Pencil size={15} />
                      编辑资料
                    </button>
                  )}
                </div>
                <div className="detail-tabs" aria-label="住民详情">
                  {[
                    ["medications", "当前用药"],
                    ["profile", "资料与药盒"],
                    ["history", "摆药历史"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      aria-pressed={tab === id}
                      className={tab === id ? "active" : ""}
                      onClick={() => setTab(id)}
                    >
                      {label}
                      {id === "medications" && (
                        <span>
                          {prescriptions.filter((p) => p.active).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {tab === "medications" && (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>用药安排</h2>
                      <p className="muted">每次用量以原片数表示</p>
                    </div>
                    {can("prescriptions") && resident.active && (
                      <button onClick={() => setRxForm(null)}>
                        <Plus size={16} />
                        添加用药
                      </button>
                    )}
                  </div>
                  <div className="panel medications-panel">
                    {prescriptions.filter((p) => p.active).map(drugRow)}
                    {!prescriptions.some((p) => p.active) && (
                      <Empty>暂无当前用药安排。</Empty>
                    )}
                  </div>
                  {prescriptions.some((p) => !p.active) && (
                    <details
                      className="stopped-medications"
                      open={showStopped}
                      onToggle={(e) => setShowStopped(e.currentTarget.open)}
                    >
                      <summary>
                        已停止用药 ·{" "}
                        {prescriptions.filter((p) => !p.active).length} 项
                      </summary>
                      <div className="panel medications-panel">
                        {prescriptions.filter((p) => !p.active).map(drugRow)}
                      </div>
                    </details>
                  )}
                </>
              )}
              {tab === "profile" && (
                <section className="panel profile-info">
                  <h2>住民资料</h2>
                  <dl>
                    <div>
                      <dt>姓名</dt>
                      <dd>{resident.name}</dd>
                    </div>
                    <div>
                      <dt>床位</dt>
                      <dd>{resident.bed || "未填写"}</dd>
                    </div>
                    <div>
                      <dt>在院状态</dt>
                      <dd>{resident.active ? "在院" : "已离院"}</dd>
                    </div>
                  </dl>
                  <div className="section-heading">
                    <h2>药盒标签</h2>
                    {can("residents") && (
                      <button onClick={() => setResidentForm(resident)}>
                        管理绑定
                      </button>
                    )}
                  </div>
                  {resident.rfid.map((id) => (
                    <div className="tag-row" key={id}>
                      <span>已绑定标签</span>
                      <code>{id}</code>
                    </div>
                  ))}
                  {!resident.rfid.length && (
                    <p className="hint">
                      尚未绑定 RFID 标签；也可使用住民条码识别药盒。
                    </p>
                  )}
                  <p className="hint">住民编号：{resident.id}</p>
                </section>
              )}
              {tab === "history" && (
                <section className="panel">
                  <h2>最近的摆药记录</h2>
                  <Failure error={history.error} />
                  {history.isPending ? (
                    <Busy />
                  ) : (
                    history.data?.items.map((task) => (
                      <button
                        className="history-row"
                        key={task.id}
                        onClick={() => setRecord(task)}
                      >
                        <div>
                          <strong>
                            {dateRange(task.plan.startDate, task.plan.endDate)}
                          </strong>
                          <small>
                            {task.deviceId}
                            {task.executionMode === "simulator"
                              ? " · 演练"
                              : ""}
                          </small>
                        </div>
                        <Badge tone={taskResult(task).tone}>
                          {taskResult(task).label}
                        </Badge>
                      </button>
                    ))
                  )}
                  {!history.isPending &&
                    !history.error &&
                    !history.data?.items.length && (
                      <Empty>尚无摆药记录。</Empty>
                    )}
                  {history.data?.nextCursor && (
                    <p className="hint">
                      这里显示最近 50 条，完整历史可在“摆药记录”中查询。
                    </p>
                  )}
                </section>
              )}
            </>
          ) : (
            <section className="panel">
              <Empty>选择或添加一位住民，查看用药安排。</Empty>
            </section>
          )}
        </section>
      </div>
      {labels && <LabelExport close={() => setLabels(false)} />}
      {residentForm !== undefined && (
        <ResidentForm
          resident={residentForm || undefined}
          close={() => setResidentForm(undefined)}
        />
      )}
      {rxForm !== undefined && resident && (
        <PrescriptionForm
          residentId={resident.id}
          prescription={rxForm || undefined}
          close={() => setRxForm(undefined)}
        />
      )}
      {parameter && (
        <ParameterForm rx={parameter} close={() => setParameter(undefined)} />
      )}
      {record && (
        <RecordDetail task={record} close={() => setRecord(undefined)} />
      )}
    </>
  );
}
