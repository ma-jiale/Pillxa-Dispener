import type { ReactNode } from "react";
import { useId, isValidElement, cloneElement, useEffect, useRef } from "react";
import { X, LoaderCircle, Search } from "lucide-react";
export function Modal({
  title,
  children,
  close,
  wide = false,
  drawer = false,
}: {
  title: string;
  children: ReactNode;
  close(): void;
  wide?: boolean;
  drawer?: boolean;
}) {
  const section = useRef<HTMLElement>(null);
  const onClose = useRef(close);
  onClose.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const items = () =>
      Array.from(
        section.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
        ) ?? [],
      ).filter((e) => e.getClientRects().length);
    (
      section.current?.querySelector<HTMLElement>("[autofocus]") ??
      items()[1] ??
      items()[0] ??
      section.current
    )?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose.current();
      }
      if (event.key !== "Tab") return;
      const elements = items(),
        first = elements[0],
        last = elements.at(-1);
      if (!first) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div className={`overlay${drawer ? " drawer-overlay" : ""}`}>
      <section
        ref={section}
        tabIndex={-1}
        className={`modal${wide ? " modal-wide" : ""}${drawer ? " drawer" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon" onClick={close} aria-label="关闭">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement<{
        id?: string;
      }>(children)
        ? cloneElement(children, { id })
        : children}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Busy() {
  return (
    <div className="empty">
      <LoaderCircle className="spin" />
      正在加载…
    </div>
  );
}
export function Filter({
  value,
  change,
  label = "搜索住民",
  placeholder = "搜索姓名或床位",
}: {
  value: string;
  change(v: string): void;
  label?: string;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <Search size={17} />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => change(e.target.value)}
      />
    </div>
  );
}
export function Failure({ error }: { error: unknown }) {
  const message =
    error instanceof Error ? error.message : "操作未完成，请重试。";
  const text = /Failed to fetch|fetch failed|NetworkError|Load failed/i.test(
    message,
  )
    ? "连接暂时不可用，请检查网络或设备连接后重试。"
    : message;
  return error ? (
    <p className="error" role="alert">
      {text}
    </p>
  ) : null;
}
export function Submit({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <button className="primary" disabled={busy}>
      {busy ? "保存中…" : children}
    </button>
  );
}
