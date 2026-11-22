import { useMemo } from "react";
import { normalizeHedefler, type HedefDosyasi } from "@ortak/hedef-duzen";
import { PROGRAMS_PATH, normalizePrograms, type ProgramsFile } from "@ortak/program";
import { useDosya } from "@/veri/kanca";

/** The programs file, read clean, with changes made on its latest state. */
export function usePrograms() {
  const file = useDosya<ProgramsFile>(PROGRAMS_PATH);
  const data = useMemo(() => normalizePrograms(file.veri), [file.veri]);
  const change = (f: (d: ProgramsFile) => ProgramsFile) => file.degistir((d) => f(normalizePrograms(d)));
  return { data, loading: file.yukleniyor, error: file.hata, change };
}

/** Open goals, for linking a program to one. */
export function useGoals() {
  const file = useDosya<HedefDosyasi>("hedefler.json");
  return useMemo(() => normalizeHedefler(file.veri).hedefler.filter((h) => !h.bitti), [file.veri]);
}
