// RecurrenciaPanel.jsx — sección completa del mapa de recurrencia territorial
// de siniestros viales detectados por el COMM.
//
// Envuelve a RecurrenciaMap con los filtros del §8 (clase de recurrencia,
// color y prioridad piloto) y el resumen del período.
//
// La clasificación viene precalculada desde Excel: acá NO se recalculan
// percentiles ni clases (§4). El backend solo filtra y sirve.

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from "recharts";
import { fetchRecurrencia, fetchRecurrenciaOptions } from "../api";
import RecurrenciaMap, { COLOR_HEX } from "./RecurrenciaMap";

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

  // Los candidatos a piloto: recurrencia + persistencia ≥ 50%. NO es lo mismo
  // que "4 o más acumulados": 15 puntos llegan a 4 siniestros pero no sostienen
  // la persistencia, y por eso quedan afuera de la selección.
  const priorizados = (data?.puntos || [])
    .filter((p) => p.prioridad && p.prioridad !== "SIN PRIORIDAD")
    .sort((a, b) => b.svAcumulados - a.svAcumulados);

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

      {priorizados.length > 0 && (
        <>
          <h3 style={{ marginTop: 26 }}>Puntos seleccionados para la prueba piloto</h3>
          <p className="panel-sub">
            Recurrencia alta o muy alta con persistencia ≥ 50% · {priorizados.length} candidatos
          </p>
          <ResponsiveContainer width="100%" height={Math.max(320, priorizados.length * 34)}>
            <BarChart data={priorizados} layout="vertical" margin={{ left: 8, right: 44 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
              <YAxis type="category" dataKey="ubicacion" width={250} interval={0}
                tick={{ fontSize: 11, fill: "var(--ink-2)" }} />
              <Tooltip cursor={{ fill: "var(--brand-050)" }}
                contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 13,
                  background: "var(--surface-2)" }}
                labelStyle={{ color: "var(--ink-2)" }} itemStyle={{ color: "var(--ink)" }}
                formatter={(v, n, p) => [`${v} siniestros · ${p.payload.prioridad}`, p.payload.dispositivo]} />
              <Bar dataKey="svAcumulados" radius={[0, 6, 6, 0]} maxBarSize={22}>
                {priorizados.map((p) => (
                  <Cell key={p.dispositivo} fill={COLOR_HEX[p.color] || COLOR_HEX["SIN SEÑAL"]} />
                ))}
                <LabelList dataKey="svAcumulados" position="right" offset={8}
                  style={{ fill: "var(--ink)", fontSize: 11, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </section>
  );
}
