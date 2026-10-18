import { useQuery } from "@tanstack/react-query";
import { api } from "./platform.ts";
import { useApp } from "./context.tsx";
import type { PlanningQueueItem } from "../../../packages/contracts/src/model.ts";
export function usePlanningQueue(enabled = true) {
  const { workspace } = useApp();
  return useQuery({
    queryKey: [
      "planning-queue",
      workspace.institution.id,
      workspace.institution.settings.version,
    ],
    queryFn: () =>
      api<{ today: string; items: PlanningQueueItem[] }>("/planning/queue"),
    refetchInterval: 5000,
    enabled,
  });
}
