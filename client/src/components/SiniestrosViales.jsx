// SiniestrosViales.jsx — vista propia del mapa de recurrencia territorial de
// siniestros viales detectados por el COMM (ruta "/siniestros-viales").
//
// Va separada del tablero general a propósito: tiene otra fuente
// (siniestralidad.xlsx), otro período —acumulado enero–julio 2026, fijo— y una
// clasificación precalculada en Excel. Mezclarla con las demás categorías, que
// responden a los filtros generales, confundía las dos lecturas.

import { Link } from "react-router-dom";
import IndicadoresSV from "./IndicadoresSV";
import RecurrenciaPanel from "./RecurrenciaPanel";

export default function SiniestrosViales() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img
            className="logo"
            src="/logo-smt-negativo.png"
            alt="Ciudad SMT · Subsecretaría de Seguridad Ciudadana"
          />
          <span className="brand-divider" aria-hidden="true" />
          <h1>Siniestros viales</h1>
        </div>
        <Link to="/" className="btn">Volver al tablero</Link>
      </header>

      <main className="canvas vista-siniestros">
        <IndicadoresSV />
        <RecurrenciaPanel />
      </main>
    </div>
  );
}
