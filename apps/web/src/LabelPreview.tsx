import { useEffect, useState, useRef } from "react";
import { Busy, Failure } from "./components.tsx";
import {
  labelLayout,
  residentBarcode,
} from "../../../packages/contracts/src/model.ts";
import type { Resident } from "../../../packages/contracts/src/model.ts";
export function LabelPreview({
  residents,
  copies,
}: {
  residents: Resident[];
  copies: number;
}) {
  const [images, setImages] = useState<Record<string, string>>({}),
    [error, setError] = useState<unknown>(),
    [page, setPage] = useState(0);
  const identities = residents.map((r) => r.id).join("|");
  const preview = useRef<HTMLElement>(null);
  useEffect(() => {
    if (Object.keys(images).length)
      preview.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [images]);
  useEffect(() => {
    let cancelled = false;
    setError(undefined);
    import("bwip-js/browser")
      .then((module) => {
        const result = Object.fromEntries(
          residents.map((r) => [
            r.id,
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(module.default.toSVG({ bcid: "qrcode", text: residentBarcode(r.id), scale: 3, padding: 0 }))}`,
          ]),
        );
        if (!cancelled) setImages(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [identities]);
  const labels = residents.flatMap((r) =>
      Array.from({ length: copies }, () => r),
    ),
    perPage = labelLayout.columns * labelLayout.rows,
    pages = Math.ceil(labels.length / perPage);
  return (
    <section className="label-preview" ref={preview}>
      <div className="section-heading">
        <h3>标签预览</h3>
        <div className="actions">
          <span className="muted">
            第 {page + 1} / {pages} 页
          </span>
          {pages > 1 && (
            <>
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                上一页
              </button>
              <button
                disabled={page + 1 === pages}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </>
          )}
        </div>
      </div>
      <Failure error={error} />
      {!error && !images[residents[0]?.id] ? (
        <Busy />
      ) : (
        <div className="label-sheet" aria-label="A4 标签预览">
          {labels
            .slice(page * perPage, (page + 1) * perPage)
            .map((r, index) => (
              <div className="preview-label" key={`${r.id}:${index}`}>
                <img src={images[r.id]} alt={`${r.name}的住民识别条码`} />
                <strong>{r.name}</strong>
                <small>{r.bed || "无床位"}</small>
              </div>
            ))}
        </div>
      )}
      <p className="hint">
        {labelLayout.widthMm} × {labelLayout.widthMm} 毫米 · 每页{" "}
        {labelLayout.columns} × {labelLayout.rows}{" "}
        张。预览用于核对姓名、床位和数量，实际打印尺寸以导出的 PDF 为准。
      </p>
    </section>
  );
}
