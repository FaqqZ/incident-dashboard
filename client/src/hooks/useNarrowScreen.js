// useNarrowScreen.js — true cuando el viewport está por debajo del breakpoint
// de 900px (el mismo que usa index.css para colapsar la grilla a una columna).
// Los ejes de Recharts se miden en px fijos, así que no alcanza con el CSS.

import { useEffect, useState } from "react";

const QUERY = "(max-width: 900px)";

export function useNarrowScreen() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setNarrow(e.matches);
    mql.addEventListener("change", onChange);
    setNarrow(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return narrow;
}
