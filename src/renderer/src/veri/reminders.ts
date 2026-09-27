import { useCallback, useMemo } from "react";
import { REMINDERS_PATH, normalizeReminders, type RemindersFile } from "@ortak/reminders";
import { useDosya } from "./kanca";

/**
 * Reminders of Todoist tasks (`tasks/reminders.json`). Argos-local tasks keep
 * theirs on the task itself; this file is only for tasks Todoist owns.
 */
export function useTodoistReminders(): {
  file: RemindersFile;
  change: (f: (file: RemindersFile) => RemindersFile) => Promise<boolean>;
} {
  const d = useDosya<RemindersFile>(REMINDERS_PATH);
  const file = useMemo(() => normalizeReminders(d.veri), [d.veri]);
  const { degistir } = d;
  const change = useCallback(
    (f: (file: RemindersFile) => RemindersFile) => degistir((current) => f(normalizeReminders(current))),
    [degistir],
  );
  return { file, change };
}
