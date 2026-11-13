/**
 * Catálogo local de los grupos del docente (grupos, agrupamientos, asignaturas y evaluaciones),
 * leído de los desplegables de Educa con educa_refresh_groups y guardado en el ordenador
 * para que educa_open_group llegue directo a la pantalla de notas.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATA_DIR } from "./config.js";
import { normalize } from "./grades.js";

export interface GroupEntry {
  name: string;
  /** Desplegable de Educa en el que aparece. */
  kind: "grupo" | "agrupamiento";
  subjects: string[];
}

export interface GroupCatalog {
  updatedAt: string;
  groups: GroupEntry[];
  /** Evaluaciones que ofrecía la pantalla de notas la última vez que se abrió una. */
  evaluations: string[];
}

export const CATALOG_FILE = join(DATA_DIR, "grupos.json");

export function loadCatalog(file = CATALOG_FILE): GroupCatalog | null {
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as GroupCatalog;
    return Array.isArray(raw.groups) ? { updatedAt: raw.updatedAt ?? "", groups: raw.groups, evaluations: raw.evaluations ?? [] } : null;
  } catch {
    return null;
  }
}

export function saveCatalog(catalog: GroupCatalog, file = CATALOG_FILE): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(catalog, null, 2), "utf8");
}

export type Match<T> = { ok: true; item: T } | { ok: false; reason: "ninguno" | "varios"; candidates: T[] };

/** Busca por nombre sin tildes ni mayúsculas: exacto y, si no, el único que lo contiene. */
export function findByName<T>(items: T[], wanted: string, nameOf: (item: T) => string): Match<T> {
  const w = normalize(wanted);
  const exact = items.filter(i => normalize(nameOf(i)) === w);
  if (exact.length === 1) return { ok: true, item: exact[0] };
  if (exact.length > 1) return { ok: false, reason: "varios", candidates: exact };
  const partial = items.filter(i => ` ${normalize(nameOf(i))} `.includes(` ${w} `) || normalize(nameOf(i)).replace(/ /g, "").includes(w.replace(/ /g, "")));
  if (partial.length === 1) return { ok: true, item: partial[0] };
  return { ok: false, reason: partial.length ? "varios" : "ninguno", candidates: partial };
}
