import { useCallback, useState } from "react";

const KEY = "bloomington-bus:favorite-stops";

// Favorites live only in this browser, so there are no accounts to manage. Storage can be blocked
// (private mode, strict settings), in which case favorites just don't persist.
function read(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // ignore: favorites stay for this visit only
  }
}

export function useFavorites() {
  const [ids, setIds] = useState<string[]>(read);
  const toggle = useCallback((id: string) => {
    setIds((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      write(next);
      return next;
    });
  }, []);
  return { ids, isFavorite: (id: string) => ids.includes(id), toggle };
}
