export type GateSendStatus = {
  phase: "waiting" | "sending" | "sent" | "error";
  value: number;
  error?: unknown;
};
type Schedule = (callback: () => void, delay: number) => () => void;

/** Trailing adjustment updates, with one request in flight and only the latest pending value. */
export function createSettledGateSender({
  send,
  status,
  delay = 400,
  schedule = (callback, ms) => {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
}: {
  send(value: number): Promise<void>;
  status(value: GateSendStatus): void;
  delay?: number;
  schedule?: Schedule;
}) {
  let cancelTimer: (() => void) | undefined;
  let pending: number | undefined;
  let ready = false;
  let sending = false;
  let disposed = false;
  let lastSent: number | undefined;
  const cancel = () => {
    cancelTimer?.();
    cancelTimer = undefined;
    pending = undefined;
    ready = false;
  };
  const pump = async () => {
    if (disposed || sending || !ready || pending === undefined) return;
    const value = pending;
    pending = undefined;
    ready = false;
    if (value === lastSent) {
      status({ phase: "sent", value });
      return;
    }
    sending = true;
    status({ phase: "sending", value });
    try {
      await send(value);
      lastSent = value;
      if (!disposed && pending === undefined) status({ phase: "sent", value });
    } catch (error) {
      if (!disposed && pending === undefined)
        status({ phase: "error", value, error });
    } finally {
      sending = false;
      if (!disposed && pending !== undefined) {
        if (ready) void pump();
        else status({ phase: "waiting", value: pending });
      }
    }
  };
  return {
    change(value: number) {
      if (disposed) return;
      cancelTimer?.();
      pending = value;
      ready = false;
      status({ phase: "waiting", value });
      cancelTimer = schedule(() => {
        cancelTimer = undefined;
        ready = true;
        void pump();
      }, delay);
    },
    flush() {
      if (disposed || pending === undefined) return;
      cancelTimer?.();
      cancelTimer = undefined;
      ready = true;
      void pump();
    },
    cancel,
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
