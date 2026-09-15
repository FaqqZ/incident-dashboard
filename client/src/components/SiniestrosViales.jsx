// SiniestrosViales.jsx — vista propia del mapa de recurrencia territorial de
// siniestros viales detectados por el COMM (ruta "/siniestros-viales").
//
// Va separada del tablero general a propósito: tiene otra fuente
// (siniestralidad.xlsx), otro período —acumulado enero–julio 2026, fijo— y una
// clasificación precalculada en Excel. Mezclarla con las demás categorías, que
// responden a los filtros generales, confundía las dos lecturas.

import TopBar from "./TopBar";
import IndicadoresSV from "./IndicadoresSV";
import RecurrenciaPanel from "./RecurrenciaPanel";

export default function SiniestrosViales() {
  return (
    <div className="app">
      <TopBar
        titulo="Siniestros viales detectados por el COMM"
        menu={[
          { to: "/comm", label: "Volver al tablero" },
          { to: "/comm/analisis", label: "Análisis por categoría" },
          { to: "/comm/datos", label: "Gestión de datos" },
          { to: "/", label: "Cambiar de área" },
        ]}
      />

      <main className="canvas vista-siniestros">
        <IndicadoresSV />
        <RecurrenciaPanel />
      </main>
    </div>
  );
}
