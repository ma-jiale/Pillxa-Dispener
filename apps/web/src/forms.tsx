import { useState } from "react";
import { api, configureRuntime } from "./platform.ts";
import { Modal, Field, Failure, Submit } from "./components.tsx";
import { useApp } from "./context.tsx";
import { ImagePicker } from "./ImagePicker.tsx";
import {
  mealLabels,
  slotLabels,
} from "../../../packages/contracts/src/model.ts";
import type {
  Resident,
  Prescription,
  User,
  Permission,
} from "../../../packages/contracts/src/model.ts";
function useSave(close: () => void) {
  const { refresh, notify } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return {
    busy,
    error,
    save: async (path: string, value: unknown, method?: string) => {
      setBusy(true);
      setError(undefined);
      try {
        await api(path, value, method);
        let warning = "";
        if (/^\/residents(?:\/|$)/.test(path)) {
          await configureRuntime().catch(() => {
            warning = "资料已保存，本机识别资料同步失败，请重新连接后重试";
          });
        }
        await refresh();
        notify(warning || "已保存");
        close();
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    },
  };
}
export function ResidentForm({
  resident,
  close,
}: {
  resident?: Resident;
  close(): void;
}) {
  const [name, setName] = useState(resident?.name || ""),
    [bed, setBed] = useState(resident?.bed || ""),
    [rfid, setRfid] = useState(resident?.rfid.join("\n") || ""),
    [active, setActive] = useState(resident?.active ?? true);
  const [photo, setPhoto] = useState(resident?.photo || "");
  const s = useSave(close);
  return (
    <Modal title={resident ? "编辑住民" : "添加住民"} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          s.save(
            `/residents${resident ? `/${resident.id}` : ""}`,
            {
              name,
              bed,
              photo,
              rfid: rfid.split(/[\s,;]+/).filter(Boolean),
              active,
              version: resident?.version,
            },
            resident ? "PUT" : "POST",
          );
        }}
      >
        <div className="two">
          <Field label="姓名">
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="床号">
            <input value={bed} onChange={(e) => setBed(e.target.value)} />
          </Field>
        </div>
        <ImagePicker label="住民照片" value={photo} onChange={setPhoto} />
        <h3 className="form-section-title">药盒标签</h3>
        <Field label="RFID 标签标识（每行一个）">
          <textarea
            value={rfid}
            onChange={(e) => setRfid(e.target.value)}
            placeholder="例如 AB12CD34"
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          在院住民
        </label>
        <Failure error={s.error} />
        <footer>
          <button type="button" onClick={close} disabled={s.busy}>
            取消
          </button>
          <Submit busy={s.busy}>保存住民</Submit>
        </footer>
      </form>
    </Modal>
  );
}
export function PrescriptionForm({
  residentId,
  prescription,
  close,
}: {
  residentId: string;
  prescription?: Prescription;
  close(): void;
}) {
  const { workspace } = useApp();
  const [value, setValue] = useState({
    name: prescription?.name || "",
    specification: prescription?.specification || "",
    image: prescription?.image || "",
    unit: prescription?.unit || "片",
    form: prescription?.form || "whole",
    meal: prescription?.meal || "none",
    doses: prescription?.doses || {
      morning: 0,
      noon: 0,
      evening: 0,
      bedtime: 0,
    },
    startDate:
      prescription?.startDate ||
      new Intl.DateTimeFormat("en-CA", {
        timeZone: workspace.institution.settings.timezone,
      }).format(new Date()),
    endDate: prescription?.endDate || "",
    active: prescription?.active ?? true,
  });
  const s = useSave(close);
  const [course, setCourse] = useState(
    prescription?.endDate ? "limited" : "long",
  );
  const invalidDoses = Object.values(value.doses).some(
    (n) => n > 0 && (value.form === "half" ? n !== 0.5 : !Number.isInteger(n)),
  );
  const field = (key: string, v: unknown) =>
    setValue((old) => ({ ...old, [key]: v }));
  return (
    <Modal title={prescription ? "编辑用药安排" : "添加用药安排"} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (invalidDoses) return;
          s.save(
            `/prescriptions${prescription ? `/${prescription.id}` : ""}`,
            { ...value, residentId, version: prescription?.version },
            prescription ? "PUT" : "POST",
          );
        }}
      >
        <h3 className="form-section-title">药物信息</h3>
        <div className="two">
          <Field label="药物名称">
            <input
              required
              value={value.name}
              onChange={(e) => field("name", e.target.value)}
            />
          </Field>
          <Field label="规格">
            <input
              required
              placeholder="例如 10 mg"
              value={value.specification}
              onChange={(e) => field("specification", e.target.value)}
            />
          </Field>
          <Field label="投料形态">
            <select
              value={value.form}
              onChange={(e) => field("form", e.target.value)}
            >
              <option value="whole">整片</option>
              <option value="half">人工预切半片</option>
            </select>
          </Field>
          <Field label="餐食要求">
            <select
              value={value.meal}
              onChange={(e) => field("meal", e.target.value)}
            >
              {Object.entries(mealLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ImagePicker
          label="药物图片"
          value={value.image}
          onChange={(image) => field("image", image)}
        />
        <h3 className="form-section-title">每次用量</h3>
        <p className="hint">填写原片数量。切换投料形态后，请逐项核对用量。</p>
        {invalidDoses && (
          <p className="error">
            当前用量与投料形态不一致。半片投料每次为 0.5
            片；整片投料请填写整数片。
          </p>
        )}
        <div className="dosages">
          {workspace.institution.settings.rows.map((slot) => (
            <Field key={slot} label={`${slotLabels[slot]}（片）`}>
              {value.form === "half" ? (
                <select
                  value={value.doses[slot]}
                  onChange={(e) =>
                    field("doses", {
                      ...value.doses,
                      [slot]: Number(e.target.value),
                    })
                  }
                >
                  <option value="0">不服用</option>
                  <option value="0.5">半片</option>
                  {![0, 0.5].includes(value.doses[slot]) && (
                    <option value={value.doses[slot]}>
                      {value.doses[slot]} 片（请核对）
                    </option>
                  )}
                </select>
              ) : (
                <input
                  type="number"
                  min="0"
                  max="255"
                  step="1"
                  value={value.doses[slot]}
                  onChange={(e) =>
                    field("doses", {
                      ...value.doses,
                      [slot]: Number(e.target.value),
                    })
                  }
                />
              )}
            </Field>
          ))}
        </div>
        <h3 className="form-section-title">用药期间</h3>
        <Field label="疗程">
          <select
            value={course}
            onChange={(e) => {
              setCourse(e.target.value);
              if (e.target.value === "long") field("endDate", "");
            }}
          >
            <option value="long">长期用药</option>
            <option value="limited">有限疗程</option>
          </select>
        </Field>
        <div className="two">
          <Field label="开始日期">
            <input
              type="date"
              required
              value={value.startDate}
              onChange={(e) => field("startDate", e.target.value)}
            />
          </Field>
          {course === "limited" && (
            <Field label="结束日期">
              <input
                type="date"
                required
                min={value.startDate}
                value={value.endDate}
                onChange={(e) => field("endDate", e.target.value)}
              />
            </Field>
          )}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={value.active}
            onChange={(e) => field("active", e.target.checked)}
          />
          启用此用药安排
        </label>
        <p className="hint">
          整片与半片形态、药名或规格变化后，此处方的出药参数重新调整。
        </p>
        <Failure error={s.error} />
        <footer>
          <button type="button" onClick={close} disabled={s.busy}>
            取消
          </button>
          <button className="primary" disabled={s.busy || invalidDoses}>
            {s.busy ? "保存中…" : "保存用药安排"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function ParameterForm({
  rx,
  close,
}: {
  rx: Prescription;
  close(): void;
}) {
  const [motor, setMotor] = useState(rx.parameters.motor),
    [gate, setGate] = useState(rx.parameters.gate);
  const s = useSave(close);
  return (
    <Modal title={`${rx.name} · 出药设置`} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          s.save(
            `/prescriptions/${rx.id}/parameters`,
            { version: rx.parameters.version, motor, gate, learning: false },
            "PUT",
          );
        }}
      >
        <p className="hint">
          设置仅用于此住民的这一用药条目。当前采用人工调整，自动学习尚未启用。
        </p>
        <div className="two">
          <Field label="转盘参数">
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={motor}
              onChange={(e) => setMotor(Number(e.target.value))}
            />
          </Field>
          <Field label="舵机开口">
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={gate}
              onChange={(e) => setGate(Number(e.target.value))}
            />
          </Field>
        </div>
        <Failure error={s.error} />
        <footer>
          <Submit busy={s.busy}>保存参数</Submit>
        </footer>
      </form>
    </Modal>
  );
}
const permissionNames: Record<Permission, string> = {
  residents: "维护住民",
  prescriptions: "维护处方",
  parameters: "调整参数",
  export: "导出记录",
  devices: "管理设备",
};
export function UserForm({
  user,
  close,
  resetPassword = false,
}: {
  user?: User;
  close(): void;
  resetPassword?: boolean;
}) {
  const app = useApp();
  const [value, setValue] = useState({
    username: user?.username || "",
    name: user?.name || "",
    password: "",
    role: user?.role || "staff",
    permissions: user?.permissions || ([] as Permission[]),
    active: user?.active ?? true,
  });
  const s = useSave(close);
  return (
    <Modal
      title={
        resetPassword
          ? `${user?.name} · 重置密码`
          : user
            ? "编辑账号"
            : "创建账号"
      }
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          s.save(
            `/users${user ? `/${user.id}` : ""}`,
            value,
            user ? "PUT" : "POST",
          );
        }}
      >
        <div className="two">
          <Field label="姓名">
            <input
              required
              value={value.name}
              onChange={(e) => setValue({ ...value, name: e.target.value })}
            />
          </Field>
          <Field label="账号">
            <input
              required
              disabled={!!user}
              value={value.username}
              onChange={(e) => setValue({ ...value, username: e.target.value })}
            />
          </Field>
          <Field label={user ? "新密码（留空不修改）" : "密码（至少八位）"}>
            <input
              type="password"
              required={!user || resetPassword}
              minLength={8}
              value={value.password}
              onChange={(e) => setValue({ ...value, password: e.target.value })}
            />
          </Field>
          <Field label="角色">
            <select
              value={value.role}
              disabled={!!user}
              onChange={(e) =>
                setValue({ ...value, role: e.target.value as User["role"] })
              }
            >
              <option value="staff">工作人员</option>
              {app.user.role === "platform" && (
                <option value="admin">院内管理员</option>
              )}
            </select>
          </Field>
        </div>
        {value.role === "staff" && (
          <div className="permissions">
            {Object.entries(permissionNames).map(([key, label]) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={value.permissions.includes(key as Permission)}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      permissions: e.target.checked
                        ? [...value.permissions, key as Permission]
                        : value.permissions.filter((p) => p !== key),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={value.active}
            onChange={(e) => setValue({ ...value, active: e.target.checked })}
          />
          账号启用
        </label>
        <Failure error={s.error} />
        <footer>
          <button type="button" onClick={close} disabled={s.busy}>
            取消
          </button>
          <Submit busy={s.busy}>保存账号</Submit>
        </footer>
      </form>
    </Modal>
  );
}
