// useFilters.js — estado global de filtros (reemplaza el cross-filter de Power BI).
// Todos los visuales leen de acá; un cambio de slicer o un click en un gráfico
// actualiza mapa, KPIs y gráficos a la vez.

import { create } from "zustand";

const EMPTY = { from: "", to: "", categoria: "", turno: "", mes: "", clase: "", naturaleza: "" };

export const useFilters = create((set, get) => ({
  filters: { ...EMPTY },
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
  toggleFilter: (key, value) =>
    set((s) => ({
      filters: { ...s.filters, [key]: s.filters[key] === value ? "" : value },
    })),
  reset: () => set({ filters: { ...EMPTY } }),
  hasActiveFilters: () => Object.values(get().filters).some(Boolean),
}));
