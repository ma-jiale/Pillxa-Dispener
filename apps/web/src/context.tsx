import { createContext, useContext } from "react";
import type {
  Institution,
  Resident,
  Prescription,
  Task,
  User,
  ExecutionSnapshot,
} from "../../../packages/contracts/src/model.ts";
export interface Workspace {
  institution: Institution;
  residents: Resident[];
  prescriptions: Prescription[];
  tasks: Task[];
  users?: User[];
}
export interface AppContext {
  workspace: Workspace;
  user: User;
  runtime: {
    state: ExecutionSnapshot | null;
    mode: string;
    online: boolean;
    port?: string;
    error?: string;
  };
  refresh(): Promise<void>;
  notify(message: string): void;
  action(method: string, params?: unknown): Promise<void>;
  selectedResidentId?: string;
  serviceOnline?: boolean;
  navigate(page: string, residentId?: string): void;
}
export const Context = createContext<AppContext | null>(null);
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("缺少应用上下文");
  return value;
}
