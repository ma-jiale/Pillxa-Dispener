import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, KeyRound } from "lucide-react";
import { api, credentials } from "./platform.ts";
import { useApp } from "./context.tsx";
import { Badge, Busy, Failure, Filter, Empty, Modal } from "./components.tsx";
import { UserForm } from "./forms.tsx";
import type { User } from "../../../packages/contracts/src/model.ts";
export function Team() {
  const { user, notify, refresh } = useApp();
  const q = useQuery({
    queryKey: ["users", credentials.institution],
    queryFn: () => api<User[]>("/users"),
  });
  const [edit, setEdit] = useState<User | null | undefined>();
  const [query, setQuery] = useState(""),
    [scope, setScope] = useState("active"),
    [resetting, setResetting] = useState(false),
    [toggle, setToggle] = useState<User>(),
    [busy, setBusy] = useState(false);
  const list = q.data?.filter(
    (u) =>
      `${u.name} ${u.username}`.includes(query) &&
      (scope === "all" || u.active === (scope === "active")),
  );
  return (
    <>
      <div className="page-title">
        <div>
          <h1>人员账号</h1>
          <p>
            {user.role === "platform"
              ? "创建院内管理员和工作人员。"
              : "创建本院工作人员并分配操作权限。"}
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setResetting(false);
            setEdit(null);
          }}
        >
          <Plus size={17} />
          创建账号
        </button>
      </div>
      <div className="panel">
        <div className="team-toolbar">
          <Filter
            value={query}
            change={setQuery}
            label="搜索人员"
            placeholder="搜索姓名或账号"
          />
          <select
            aria-label="账号状态筛选"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="active">启用账号</option>
            <option value="inactive">停用账号</option>
            <option value="all">全部账号</option>
          </select>
          <span>{list?.length ?? 0} 个账号</span>
        </div>
        {q.isPending ? (
          <Busy />
        ) : (
          <>
            <Failure error={q.error} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>账号</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list?.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="person-cell">
                          <span className="avatar">{u.name.slice(-2)}</span>
                          <strong>{u.name}</strong>
                        </div>
                      </td>
                      <td>{u.username}</td>
                      <td>
                        {u.role === "platform"
                          ? "平台管理员"
                          : u.role === "admin"
                            ? "院内管理员"
                            : "工作人员"}
                      </td>
                      <td>
                        <Badge tone={u.active ? "blue" : ""}>
                          {u.active ? "启用" : "停用"}
                        </Badge>
                      </td>
                      <td>
                        <details className="more-menu">
                          <summary aria-label={`${u.name}账号操作`}>
                            ···
                          </summary>
                          <div>
                            <button
                              onClick={() => {
                                setResetting(false);
                                setEdit(u);
                              }}
                            >
                              <Pencil size={15} />
                              编辑账号
                            </button>
                            <button
                              onClick={() => {
                                setResetting(true);
                                setEdit(u);
                              }}
                            >
                              <KeyRound size={15} />
                              重置密码
                            </button>
                            <button
                              disabled={u.id === user.id}
                              onClick={() => setToggle(u)}
                            >
                              {u.active ? "停用账号" : "恢复账号"}
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!q.error && !list?.length && (
              <Empty>没有符合条件的人员账号。</Empty>
            )}
          </>
        )}
      </div>
      {edit !== undefined && (
        <UserForm
          user={edit || undefined}
          resetPassword={resetting}
          close={() => {
            setEdit(undefined);
            q.refetch();
          }}
        />
      )}
      {toggle && (
        <Modal
          title={`${toggle.active ? "停用" : "恢复"}账号`}
          close={() => setToggle(undefined)}
        >
          <p>
            {toggle.active
              ? "停用后，该人员将无法登录。已有操作记录会保留。"
              : "恢复后，该人员可以重新登录。"}
          </p>
          <p className="hint">
            {toggle.name} · {toggle.username}
          </p>
          <footer>
            <button onClick={() => setToggle(undefined)}>取消</button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(
                    `/users/${toggle.id}`,
                    {
                      name: toggle.name,
                      active: !toggle.active,
                      role: toggle.role,
                      permissions: toggle.permissions,
                    },
                    "PUT",
                  );
                  await q.refetch();
                  await refresh();
                  setToggle(undefined);
                  notify("账号状态已更新");
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "保存中…" : `确认${toggle.active ? "停用" : "恢复"}`}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
