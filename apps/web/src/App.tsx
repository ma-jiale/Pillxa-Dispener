import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  UsersRound,
  Pill,
  History,
  Settings2,
  UserRoundCog,
  LogOut,
  Plus,
  WifiOff,
  Download,
  Monitor,
} from "lucide-react";
import { api, local, credentials, configureRuntime } from "./platform.ts";
import { Auth } from "./Auth.tsx";
import { Context } from "./context.tsx";
import type { Workspace } from "./context.tsx";
import { Modal, Field, Failure, Busy } from "./components.tsx";
import { Overview } from "./Overview.tsx";
import { Residents } from "./Residents.tsx";
import { Execute } from "./Execute.tsx";
import { Records } from "./Records.tsx";
import { Settings } from "./Settings.tsx";
import { Team } from "./Team.tsx";
import { executionView } from "./presentation.ts";
import type {
  Institution,
  User,
} from "../../../packages/contracts/src/model.ts";
const pages = [
  { id: "overview", name: "今日工作", icon: LayoutDashboard },
  { id: "residents", name: "住民与用药", icon: UsersRound },
  { id: "execute", name: "摆药工作台", icon: Pill },
  { id: "records", name: "摆药记录", icon: History },
  { id: "team", name: "人员账号", icon: UserRoundCog },
  { id: "settings", name: "设置", icon: Settings2 },
];
export function App() {
  const cache = useQueryClient();
  const [signed, setSigned] = useState(!!credentials.token),
    [institution, setInstitution] = useState(credentials.institution),
    [page, setPage] = useState("overview"),
    [toast, setToast] = useState(""),
    [create, setCreate] = useState(false),
    [orgName, setOrgName] = useState("");
  const [selectedResidentId, setSelectedResidentId] = useState<string>();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [page]);
  const [settingsCategory, setSettingsCategory] = useState<
    "general" | "updates"
  >("general");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{
    page: string;
    residentId?: string;
  }>();
  const go = (next: string, residentId?: string) => {
    if (page === "settings" && settingsDirty && next !== page) {
      setPendingNavigation({ page: next, residentId });
      return;
    }
    setPage(next);
    setSelectedResidentId(residentId);
  };
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 5500);
  };
  const userQuery = useQuery({
    queryKey: ["me", signed],
    queryFn: () =>
      api<{
        user: User;
      }>("/me"),
    enabled: signed,
    retry: false,
  });
  const orgs = useQuery({
    queryKey: ["institutions", signed],
    queryFn: () => api<Institution[]>("/institutions"),
    enabled: signed && !!userQuery.data,
    retry: false,
  });
  const workspace = useQuery({
    queryKey: ["workspace", institution],
    queryFn: () => api<Workspace>("/workspace"),
    enabled: signed && !!institution && !!userQuery.data,
    refetchInterval: 4000,
    retry: false,
  });
  const runtime = useQuery({
    queryKey: ["runtime"],
    queryFn: () => local("status"),
    enabled: signed,
    refetchInterval: 700,
    retry: false,
  });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["workspace"] }),
      cache.invalidateQueries({ queryKey: ["runtime"] }),
      cache.invalidateQueries({ queryKey: ["users"] }),
      cache.invalidateQueries({ queryKey: ["planning-queue"] }),
      cache.invalidateQueries({ queryKey: ["records"] }),
      cache.invalidateQueries({ queryKey: ["resident-history"] }),
    ]);
  };
  const action = async (method: string, params?: unknown) => {
    await local(method, params);
    // Device controls finish against local state; unavailable central queries must
    // never hold the pause/resume controls disabled during offline work.
    await cache.invalidateQueries({ queryKey: ["runtime"] });
    void refresh().catch(() => {});
  };
  const select = async (id: string) => {
    const previous = credentials.institution;
    credentials.institution = id;
    try {
      await configureRuntime();
      setInstitution(id);
    } catch (e) {
      credentials.institution = previous;
      notify((e as Error).message);
    }
  };
  if (!signed)
    return (
      <Auth
        done={() => {
          setSigned(true);
          setInstitution(credentials.institution);
          cache.invalidateQueries();
        }}
      />
    );
  if (userQuery.isPending) return <Busy />;
  if (userQuery.error)
    return (
      <div className="login-error">
        <Failure error={userQuery.error} />
        <button
          onClick={() => {
            credentials.token = "";
            setSigned(false);
          }}
        >
          重新登录
        </button>
      </div>
    );
  const user = userQuery.data!.user;
  return (
    <div
      className={`app-shell${page === "settings" && institution ? " settings-open" : ""}`}
    >
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <picture>
            <source
              media="(max-width: 800px)"
              srcSet="/branding/pillxa-mark-rounded.png"
            />
            <img src="/branding/pillxa-wordmark.svg" alt="Pillxai" />
          </picture>
          <small>DISPENSER</small>
        </a>
        <div className="institution-picker">
          <label>当前养老院</label>
          {user.role === "platform" ? (
            <select
              value={institution}
              aria-label="当前养老院"
              onChange={(e) => select(e.target.value)}
            >
              <option value="">选择养老院</option>
              {orgs.data?.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="institution-name">
              {orgs.data?.find((org) => org.id === institution)?.name ||
                "正在读取机构…"}
            </div>
          )}
          {user.role === "platform" && (
            <button className="link" onClick={() => setCreate(true)}>
              <Plus size={13} />
              创建养老院
            </button>
          )}
        </div>
        <nav aria-label="主导航">
          {pages
            .filter((p) => p.id !== "team" || user.role !== "staff")
            .map((p) => (
              <button
                className={page === p.id ? "active" : ""}
                key={p.id}
                aria-current={page === p.id ? "page" : undefined}
                title={p.name}
                onClick={() => {
                  if (p.id === "settings") setSettingsCategory("general");
                  go(p.id);
                }}
              >
                <p.icon size={19} />
                {p.name}
                {p.id === "execute" &&
                  runtime.data?.state &&
                  runtime.data.state.phase !== "ended" && (
                    <span className="dot" />
                  )}
              </button>
            ))}
        </nav>
        <div className="sidebar-footer">
          <div className="profile">
            <span className="avatar">{user.name.slice(-1)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>
                {user.role === "platform"
                  ? "平台管理员"
                  : user.role === "admin"
                    ? "院内管理员"
                    : "工作人员"}
              </small>
            </div>
            <button
              className="icon"
              aria-label="退出登录"
              onClick={async () => {
                if (
                  runtime.data?.state?.hasStarted &&
                  runtime.data.state.phase !== "ended"
                ) {
                  notify("当前有已开始的任务，请先完成处理后退出");
                  return;
                }
                await api("/logout", {}).catch(() => {});
                credentials.token = "";
                cache.clear();
                setSigned(false);
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>{pages.find((p) => p.id === page)?.name}</span>
          <div>
            {workspace.error ? (
              <span className="offline">
                <WifiOff size={15} />
                资料连接中断 · 已开始任务可继续
              </span>
            ) : (
              <span className="online">
                <span className="dot" />
                {workspace.isPending ? "正在连接资料…" : "资料已连接"}
              </span>
            )}
            <span className="device-status">
              <Monitor size={15} />
              {runtime.data?.mode === "simulator"
                ? "演练模式"
                : runtime.data?.state?.connected || runtime.data?.port
                  ? "本机端口已打开"
                  : "本机未连接"}
            </span>
            <button
              className="icon"
              aria-label="检查软件更新"
              title="软件更新"
              onClick={() => {
                setSettingsCategory("updates");
                go("settings");
              }}
            >
              <Download size={18} />
            </button>
          </div>
        </header>
        {page !== "execute" &&
          runtime.data?.state &&
          runtime.data.state.phase !== "ended" && (
            <div className="active-task-bar">
              <Pill size={17} />
              <strong>{runtime.data.state.plan.resident.name}</strong>
              <span>
                {executionView(runtime.data.state).batch?.name} ·{" "}
                {runtime.data.state.phase === "paused"
                  ? "已暂停"
                  : "本机有未结束任务"}
              </span>
              <button className="link" onClick={() => go("execute")}>
                返回摆药 →
              </button>
            </div>
          )}
        <div className="content">
          {!institution ? (
            <div className="welcome panel">
              <h1>建立第一个养老院工作空间</h1>
              <p>创建养老院后，添加院内管理员、住民和用药安排。</p>
              {user.role === "platform" && (
                <button className="primary" onClick={() => setCreate(true)}>
                  <Plus size={17} />
                  创建养老院
                </button>
              )}
              <Failure error={orgs.error} />
            </div>
          ) : workspace.data ? (
            <Context.Provider
              value={{
                workspace: workspace.data,
                user,
                runtime: runtime.data || {
                  state: null,
                  mode: "simulator",
                  online: false,
                },
                refresh,
                notify,
                action,
                selectedResidentId,
                serviceOnline: !workspace.error,
                navigate: go,
              }}
            >
              {page === "overview" ? (
                <Overview />
              ) : page === "residents" ? (
                <Residents />
              ) : page === "execute" ? (
                <Execute />
              ) : page === "records" ? (
                <Records />
              ) : page === "team" ? (
                <Team />
              ) : (
                <Settings
                  key={workspace.data.institution.id}
                  initialCategory={settingsCategory}
                  onDirtyChange={setSettingsDirty}
                />
              )}
            </Context.Provider>
          ) : workspace.isPending ? (
            <Busy />
          ) : (
            <div className="panel">
              <Failure error={workspace.error} />
              <button onClick={() => workspace.refetch()}>重新连接</button>
            </div>
          )}
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {pendingNavigation && (
        <Modal
          title="机构设置尚未保存"
          close={() => setPendingNavigation(undefined)}
        >
          <p>离开后，本次未保存的机构设置更改将丢失。</p>
          <footer>
            <button onClick={() => setPendingNavigation(undefined)}>
              继续编辑
            </button>
            <button
              onClick={() => {
                setSettingsDirty(false);
                setPage(pendingNavigation.page);
                setSelectedResidentId(pendingNavigation.residentId);
                setPendingNavigation(undefined);
              }}
            >
              放弃更改并离开
            </button>
          </footer>
        </Modal>
      )}
      {create && (
        <Modal title="创建养老院" close={() => setCreate(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const org = await api("/institutions", { name: orgName });
                await orgs.refetch();
                await select(org.id);
                setCreate(false);
                setOrgName("");
                notify("养老院已创建，请添加院内管理员");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <Field label="养老院名称">
              <input
                autoFocus
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </Field>
            <footer>
              <button className="primary">创建</button>
            </footer>
          </form>
        </Modal>
      )}
    </div>
  );
}
