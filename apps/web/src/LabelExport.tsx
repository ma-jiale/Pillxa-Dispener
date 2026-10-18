import { useEffect, useState } from "react";
import { FileDown, Check } from "lucide-react";
import { Modal, Field, Failure, Filter } from "./components.tsx";
import { useApp } from "./context.tsx";
import { credentials } from "./platform.ts";
import { LabelPreview } from "./LabelPreview.tsx";
import type { Resident } from "../../../packages/contracts/src/model.ts";

export function LabelExport({ close }: { close(): void }) {
  const { workspace } = useApp();
  const residents = workspace.residents.filter((r) => r.active);
  const [selected, setSelected] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [copies, setCopies] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [url, setUrl] = useState("");
  const list = residents.filter((r) => `${r.name} ${r.bed}`.includes(query));
  useEffect(() => {
    setUrl("");
  }, [selected, copies]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const preview = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`${credentials.server}/api/labels`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${credentials.token}`,
          "x-institution-id": workspace.institution.id,
        },
        body: JSON.stringify({ residentIds: selected, copies }),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).message || "标签生成失败，请重试",
        );
      setUrl(URL.createObjectURL(await response.blob()));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="导出住民标签" wide close={close}>
      <div className="label-export-layout">
        <section>
          <Filter value={query} change={setQuery} />
          <div className="list-toolbar">
            <span className="muted">已选择 {selected.length} 位</span>
            <button
              className="link"
              disabled={busy}
              onClick={() =>
                setSelected([
                  ...new Set([...selected, ...list.map((r) => r.id)]),
                ])
              }
            >
              全选当前列表
            </button>
            <button
              className="link"
              disabled={busy}
              onClick={() => setSelected([])}
            >
              清空
            </button>
          </div>
          <div className="label-residents">
            {list.map((r) => (
              <label className="label-person" key={r.id}>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selected.includes(r.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, r.id]
                        : selected.filter((id) => id !== r.id),
                    )
                  }
                />
                <strong>{r.name}</strong>
                <span>{r.bed || "未填写床位"}</span>
              </label>
            ))}
          </div>
        </section>
        <section className="label-summary">
          <Field label="每位住民的标签份数">
            <input
              type="number"
              disabled={busy}
              min="1"
              max="100"
              value={copies}
              onChange={(e) => setCopies(Number(e.target.value))}
            />
          </Field>
          <div className="label-totals">
            <strong>
              {selected.length * copies || 0}
              <small>张标签</small>
            </strong>
            <p>
              A4 · 每页 96 张 · 共{" "}
              {Math.ceil((selected.length * copies) / 96) || 0} 页
            </p>
          </div>
          <p className="hint">标签包含姓名、床位和用于识别住民的条码。</p>
          <button
            disabled={
              busy ||
              !selected.length ||
              !Number.isInteger(copies) ||
              copies < 1 ||
              copies > 100
            }
            onClick={preview}
          >
            {busy ? "正在生成…" : url ? "重新生成预览" : "生成预览"}
          </button>
          {url && (
            <p className="success">
              <Check size={15} />
              标签已生成，可以导出 PDF
            </p>
          )}
        </section>
      </div>
      <Failure error={error} />
      {url && (
        <LabelPreview
          residents={selected
            .map((id) => residents.find((r) => r.id === id))
            .filter((r): r is Resident => !!r)}
          copies={copies}
        />
      )}
      <footer>
        <button onClick={close}>取消</button>
        <a
          className={`button primary${!url ? " disabled" : ""}`}
          href={url || undefined}
          download="Pillxai-住民标签.pdf"
          aria-disabled={!url}
          onClick={(e) => {
            if (!url) e.preventDefault();
          }}
        >
          <FileDown size={17} />
          导出 PDF
        </a>
      </footer>
    </Modal>
  );
}
