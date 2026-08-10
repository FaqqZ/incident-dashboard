// useDataVersion.js — estado global para controlar recargas de datos tras uploads
// Cuando se incrementa dataVersion, el dashboard vuelve a pedir /api/dashboard

import { create } from "zustand";

export const useDataVersion = create((set) => ({
  dataVersion: 0,
  increment: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),
}));
