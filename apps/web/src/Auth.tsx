import { useEffect, useState } from "react";
import { api, credentials } from "./platform.ts";
import { Field, Failure, Submit } from "./components.tsx";
export function Auth({ done }: { done(): void }) {
  const [setup, setSetup] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const [server, setServer] = useState(credentials.server),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  const inspect = () => {
    credentials.server = server;
    api("/setup")
      .then((r) => setSetup(r.required))
      .catch(setError);
  };
  useEffect(inspect, []);
  return (
    <div className="auth">
      <div className="auth-story">
        <img src="/branding/pillxa-wordmark.svg" alt="Pillxai" />
        <h1>
          把每一次摆药，
          <br />
          安排得清清楚楚。
        </h1>
        <p>
          住民用药安排、机器执行与记录，
          <br />
          在一个工作空间中完成。
        </p>
        <div className="auth-art">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <small>Pillxai Dispenser</small>
      </div>
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            credentials.server = server;
            if (setup) await api("/setup", { username, password, name });
            const result = await api("/login", { username, password });
            credentials.token = result.token;
            credentials.institution = result.user.institutionId || "";
            done();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <BadgeIntro />
        <h2>{setup ? "创建平台管理员" : "登录工作空间"}</h2>
        <p className="muted">
          {setup
            ? "首次启动，由你创建管理员账号。"
            : "使用院内管理员分配给你的账号。"}
        </p>
        <details className="connection-options">
          <summary>连接设置</summary>
          <Field label="服务地址">
            <input
              value={server}
              placeholder="本机使用可留空"
              onChange={(e) => setServer(e.target.value)}
              onBlur={inspect}
            />
          </Field>
        </details>
        {setup && (
          <Field label="你的姓名">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}
        <Field label="账号">
          <input
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="密码">
          <input
            type="password"
            autoComplete={setup ? "new-password" : "current-password"}
            minLength={setup ? 8 : 1}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Failure error={error} />
        <Submit busy={busy}>{setup ? "创建并进入" : "登录"}</Submit>
        <small className="muted">使用你所在养老院的账号登录。</small>
      </form>
    </div>
  );
}
function BadgeIntro() {
  return <div className="eyebrow">日常用药 · 有序协作</div>;
}
