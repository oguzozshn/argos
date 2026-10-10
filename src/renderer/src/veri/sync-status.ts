import { useEffect, useState } from "react";
import type { TodoistSyncStatus } from "@ortak/tipler";
import { kopru } from "./kanca";

/** Whether Argos reaches Todoist right now. The screens show Argos's copy either way. */
export function useTodoistSyncStatus(): TodoistSyncStatus | null {
  const [status, setStatus] = useState<TodoistSyncStatus | null>(null);
  useEffect(() => {
    const k = kopru();
    if (!k) return;
    let gone = false;
    void k.todoist.syncStatus().then((s) => !gone && setStatus(s));
    const off = k.todoist.onSyncStatus(setStatus);
    return () => {
      gone = true;
      off();
    };
  }, []);
  return status;
}
