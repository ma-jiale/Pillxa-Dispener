import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  FileDown,
  SlidersHorizontal,
  ArrowDown,
  ArrowUp,
  Search,
  X,
} from "lucide-react";
import { useApp } from "./context.tsx";
import { Badge, Empty, Failure, Filter, Busy } from "./components.tsx";
import { api, download } from "./platform.ts";
import { RecordDetail } from "./RecordDetail.tsx";
import { taskResult, dateRange, dateTime } from "./presentation.ts";
import type {
  Task,
  RecordFilters,
  User,
} from "../../../packages/contracts/src/model.ts";

export function Records() {
  const { workspace, user, notify } = useApp();
  const [filters, setFilters] = useState<RecordFilters>({ sort: "newest" }),
    [draft, setDraft] = useState<RecordFilters>({ sort: "newest" }),
    [advanced, setAdvanced] = useState(false),
    [task, setTask] = useState<Task>();
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => !!value) as [
      string,
      string,
    ][],
  ).toString();
  const records = useInfiniteQuery({
    queryKey: ["records", workspace.institution.id, query],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<{ items: Task[]; nextCursor?: string }>(
        `/records?${query}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: 5000,
  });
  const operators = useQuery({
    queryKey: ["record-operators", workspace.institution.id],
    queryFn: () => api<User[]>("/users"),
    enabled: user.role !== "staff" && advanced,
  });
  const tasks = records.data?.pages.flatMap((page) => page.items) ?? [];
  const change = (key: keyof RecordFilters, value: string) =>
    setDraft({ ...draft, [key]: value || undefined });
  const dirty = JSON.stringify(draft) !== JSON.stringify(filters);
  const canExport =
    user.role !== "staff" || user.permissions.includes("export");
  return (
    <>
      <div className="page-title">
        <div>
          <h1>摆药记录</h1>
          <p>查看每次摆药的实际结果与处理经过。</p>
        </div>
        {canExport && (
          <button
            onClick={() =>
              download(
                `/records/export?${query}`,
                "Pillxai-摆药记录.json",
              ).catch((e) => notify(e.message))
            }
          >
            <FileDown size={17} />
            导出筛选结果
          </button>
        )}
      </div>
      <section className="panel records-panel">
        <form
          className="record-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ ...draft });
          }}
        >
          <div className="filter-primary">
            <Filter
              value={draft.q ?? ""}
              change={(value) => change("q", value)}
              placeholder="搜索住民姓名或床位"
            />
            <label>
              <span>摆药日期</span>
              <input
                aria-label="摆药开始日期"
                type="date"
                value={draft.dateFrom ?? ""}
                onChange={(e) => change("dateFrom", e.target.value)}
              />
              <span>至</span>
              <input
                aria-label="摆药结束日期"
                type="date"
                value={draft.dateTo ?? ""}
                min={draft.dateFrom || undefined}
                onChange={(e) => change("dateTo", e.target.value)}
              />
            </label>
            <select
              aria-label="摆药结果筛选"
              value={draft.result ?? ""}
              onChange={(e) => change("result", e.target.value)}
            >
              <option value="">全部结果</option>
              <option value="complete">已完成摆药</option>
              <option value="attention">需要核对</option>
              <option value="active">正在处理</option>
              <option value="cancelled">已取消</option>
            </select>
            <button
              type="button"
              className={advanced ? "selected" : ""}
              aria-expanded={advanced}
              onClick={() => setAdvanced(!advanced)}
            >
              <SlidersHorizontal size={16} />
              更多筛选
            </button>
            <button className="primary">
              <Search size={16} />
              查询
            </button>
          </div>
          {advanced && (
            <div className="filter-advanced">
              <label>
                药物
                <input
                  value={draft.drug ?? ""}
                  placeholder="输入药名"
                  onChange={(e) => change("drug", e.target.value)}
                />
              </label>
              <label>
                设备
                <input
                  value={draft.device ?? ""}
                  placeholder="输入设备名称"
                  onChange={(e) => change("device", e.target.value)}
                />
              </label>
              <label>
                操作人
                <select
                  value={draft.operator ?? ""}
                  onChange={(e) => change("operator", e.target.value)}
                >
                  <option value="">全部人员</option>
                  <option value={user.id}>{user.name}（本人）</option>
                  {operators.data
                    ?.filter((u) => u.id !== user.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                操作环境
                <select
                  value={draft.mode ?? ""}
                  onChange={(e) => change("mode", e.target.value)}
                >
                  <option value="">全部环境</option>
                  <option value="serial">真实机器</option>
                  <option value="simulator">演练模式</option>
                </select>
              </label>
            </div>
          )}
        </form>
        <div className="table-toolbar">
          <span>
            {records.isPending ? "正在查询…" : `已显示 ${tasks.length} 条记录`}
            {dirty && (
              <span className="attention-text">
                {" "}
                · 条件已修改，点击查询生效
              </span>
            )}
          </span>
          <button
            className="link"
            onClick={() => {
              setDraft({ sort: "newest" });
              setFilters({ sort: "newest" });
            }}
          >
            <X size={14} />
            清除筛选
          </button>
        </div>
        <Failure error={records.error} />
        <div className="table-wrap record-table-wrap">
          <table className="record-table">
            <thead>
              <tr>
                <th>住民</th>
                <th>
                  <button
                    className="sort-heading"
                    onClick={() => {
                      const sort =
                        filters.sort === "oldest" ? "newest" : "oldest";
                      setFilters({ ...filters, sort });
                      setDraft({ ...draft, sort });
                    }}
                  >
                    摆药时间
                    {filters.sort === "oldest" ? (
                      <ArrowUp size={14} />
                    ) : (
                      <ArrowDown size={14} />
                    )}
                  </button>
                </th>
                <th>覆盖日期</th>
                <th>设备</th>
                <th>结果</th>
                <th>
                  <span className="sr-only">查看详情</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const result = taskResult(t);
                return (
                  <tr
                    key={t.id}
                    onClick={() => setTask(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setTask(t);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`查看${t.plan.resident.name}的摆药记录`}
                  >
                    <td>
                      <div className="person-cell">
                        <span className="avatar">
                          {t.plan.resident.name.slice(-2)}
                        </span>
                        <div>
                          <strong>{t.plan.resident.name}</strong>
                          <small>{t.plan.resident.bed || "未填写床位"}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>
                        {dateTime(
                          t.createdAt,
                          workspace.institution.settings.timezone,
                        )}
                      </strong>
                      <small>
                        {new Date(t.createdAt).toLocaleDateString("zh-CN", {
                          timeZone: workspace.institution.settings.timezone,
                          year: "numeric",
                        })}
                      </small>
                    </td>
                    <td>
                      {dateRange(t.plan.startDate, t.plan.endDate)}
                      <small>
                        {t.plan.batches.length} 项药物 · {t.plan.trays.length}{" "}
                        盘
                      </small>
                    </td>
                    <td>
                      {t.deviceId}
                      {t.executionMode === "simulator" && (
                        <small className="attention-text">演练记录</small>
                      )}
                    </td>
                    <td>
                      <Badge tone={result.tone}>{result.label}</Badge>
                    </td>
                    <td>
                      <button
                        className="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTask(t);
                        }}
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {records.isPending && <Busy />}
        {!records.isPending && !records.error && !tasks.length && (
          <Empty>没有符合条件的记录，请调整筛选。</Empty>
        )}
        {records.hasNextPage && (
          <div className="load-more">
            <button
              disabled={records.isFetchingNextPage}
              onClick={() => records.fetchNextPage()}
            >
              {records.isFetchingNextPage ? "正在加载…" : "加载更多记录"}
            </button>
          </div>
        )}
      </section>
      {task && <RecordDetail task={task} close={() => setTask(undefined)} />}
    </>
  );
}
