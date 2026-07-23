import { useCallback, useEffect, useState } from "react";
import type { CustomColumnDef } from "./columns";

/**
 * Persist a page's user-defined column definitions in localStorage.
 *
 * Column definitions are stored per storage key (e.g. "sites") so each entity
 * page keeps its own set. This is the "persist for now" layer described in the
 * requirements; it can later be swapped for a DB-backed store without changing
 * the calling pages.
 */
export function useCustomColumns(storageKey: string) {
  const lsKey = `vf-cmdb:columns:${storageKey}`;

  const [cols, setCols] = useState<CustomColumnDef[]>(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      return raw ? (JSON.parse(raw) as CustomColumnDef[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(lsKey, JSON.stringify(cols));
    } catch {
      /* storage may be unavailable; ignore */
    }
  }, [lsKey, cols]);

  const addCol = useCallback((def: CustomColumnDef) => {
    setCols((prev) => {
      if (prev.some((c) => c.key === def.key)) {
        return prev.map((c) => (c.key === def.key ? def : c));
      }
      return [...prev, def];
    });
  }, []);

  const updateCol = useCallback((key: string, def: CustomColumnDef) => {
    setCols((prev) => prev.map((c) => (c.key === key ? def : c)));
  }, []);

  const removeCol = useCallback((key: string) => {
    setCols((prev) => prev.filter((c) => c.key !== key));
  }, []);

  return { cols, addCol, updateCol, removeCol };
}
