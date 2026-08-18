// RecurrenciaPanel.jsx — sección completa del mapa de recurrencia territorial
// de siniestros viales detectados por el COMM.
//
// Envuelve a RecurrenciaMap con los filtros del §8 (clase de recurrencia,
// color y prioridad piloto) y el resumen del período.
//
// La clasificación viene precalculada desde Excel: acá NO se recalculan
// percentiles ni clases (§4). El backend solo filtra y sirve.

import { useEffect, useState } from "react";
import { fetchRecurrencia, fetchRecurrenciaOptions } from "../api";
import RecurrenciaMap from "./RecurrenciaMap";

const nf = (n) => (n ?? 0).toLocaleString("es-AR");

const VACIO = { clase: "", color: "", prioridad: "" };

export default function RecurrenciaPanel() {
  const [filtros, setFiltros] = useState(VACIO);
  const [opciones, setOpciones] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRecurrenciaOptions().then(setOpciones).catch(() => setOpciones(null));
  }, []);

  useEffect(() => {
    fetchRecurrencia(filtros)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message));
  }, [filtros]);

  const set = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));
  const hayFiltros = Object.values(filtros).some(Boolean);
  const r = data?.resumen;

  return (
    <section className="panel panel-wide" style={{ marginBottom: 20 }}>
      <h3>Recurrencia territorial de siniestros viales detectados por el COMM</h3>
      <p className="panel-sub">
        {data?.periodo || "Acumulado enero–julio de 2026"} · el color indica la recurrencia
        relativa del punto, no un nivel de riesgo vial
      </p>

      {error && (
        <div className="banner-error" style={{ marginBottom: 16 }}>
          No se pudo cargar la recurrencia: {error}
        </div>
      )}

      {/* §8 — filtros sugeridos */}
      <div className="filters recurrencia-filtros">
        <div className="field">
          <label htmlFor="r-clase">Clase de recurrencia</label>
          <select id="r-clase" value={filtros.clase} onChange={(e) => set("clase", e.target.value)}>
            <option value="">Todas</option>
            {(opciones?.clases || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="r-color">Color</label>
          <select id="r-color" value={filtros.color} onChange={(e) => set("color", e.target.value)}>
            <option value="">Todos</option>
            {(opciones?.colores || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="r-prioridad">Prioridad piloto</label>
          <select id="r-prioridad" value={filtros.prioridad}
            onChange={(e) => set("prioridad", e.target.value)}>
            <option value="">Todas</option>
            {(opciones?.prioridades || []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="spacer" />
        <button className="btn" onClick={() => setFiltros(VACIO)} disabled={!hayFiltros}
          style={{ opacity: hayFiltros ? 1 : 0.5 }}>
          Limpiar
        </button>
      </div>

      {r && (
        <div className="recurrencia-resumen">
          <span><b>{nf(r.puntos)}</b> puntos en vista</span>
          <span><b>{nf(r.svTotales)}</b> siniestros acumulados</span>
          <span><b>{nf(r.prioridad1)}</b> Prioridad 1</span>
          <span><b>{nf(r.prioridad2)}</b> Prioridad 2</span>
        </div>
      )}

      {data && <RecurrenciaMap puntos={data.puntos} />}
    </section>
  );
}
