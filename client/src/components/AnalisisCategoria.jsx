// AnalisisCategoria.jsx — la vista de siniestros viales, generalizada a
// cualquier categoría (ruta "/analisis").
//
// Aplica la misma metodología del COMM: percentiles P75/P90/P95 sobre el
// promedio mensual por cámara, más persistencia ≥ 50% para la prioridad piloto.
// Con "SINIESTROS VIALES." reproduce la planilla del COMM al dígito.
//
// NO incluye franja horaria: la columna `fecha` guarda la hora en formato de 12
// horas sin AM/PM, así que el gráfico saldría mal. La vista lo explica en vez de
// dibujar algo incorrecto.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, LabelList,
} from "recharts";
import { fetchAnalisisCategoria, fetchOptions } from "../api";
import RecurrenciaMap, { COLOR_HEX } from "./RecurrenciaMap";
import KpiCard from "./KpiCard";

const nf = (n, d = 0) =>
  (n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const tip = {
  contentStyle: {
    borderRadius: 10, border: "1px solid var(--border)", fontSize: 13,
    background: "var(--surface-2)",
  },
  labelStyle: { color: "var(--ink-2)" },
  itemStyle: { color: "var(--ink)" },
};

export default function AnalisisCategoria() {
  const [categorias, setCategorias] = useState([]);
  const [categoria, setCategoria] = useState("SINIESTROS VIALES.");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchOptions().then((o) => setCategorias(o.categorias || [])).catch(() => setCategorias([]));
  }, []);

  useEffect(() => {
    setData(null);
    fetchAnalisisCategoria(categoria)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message));
  }, [categoria]);

  const k = data?.kpis;
  const variacion = k?.variacionUltimoMes;
  const ultimoMes = data?.porMes?.[data.porMes.length - 1]?.name;
  const priorizados = (data?.puntos || [])
    .filter((p) => p.prioridad !== "SIN PRIORIDAD")
    .sort((a, b) => b.svAcumulados - a.svAcumulados);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="logo" src="/logo-smt-negativo.png"
            alt="Ciudad SMT · Subsecretaría de Seguridad Ciudadana" />
          <span className="brand-divider" aria-hidden="true" />
          <h1>Análisis por categoría</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link to="/siniestros-viales" className="btn" style={{ fontSize: "12px" }}>
            Siniestros viales
          </Link>
          <Link to="/" className="btn">Volver al tablero</Link>
        </div>
      </header>

      <main className="canvas vista-siniestros">
        <div className="filters">
          <div className="field" style={{ minWidth: 300 }}>
            <label htmlFor="a-cat">Categoría</label>
            <select id="a-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="spacer" />
          {data && (
            <span className="updated">
              Período: {cap(data.porMes[0]?.name)}–{cap(ultimoMes)} · {nf(data.mesesObservados)} meses
            </span>
          )}
        </div>

        {error && <div className="banner-error">No se pudo cargar el análisis: {error}</div>}

        {!data && !error && (
          <div className="state"><div className="spinner" /><div className="big">Analizando…</div></div>
        )}

        {data && (
          <>
            <section className="kpi-grid">
              <KpiCard label="Incidentes detectados" value={nf(k.total)}
                hint={`En ${nf(data.mesesObservados)} meses observados`} accent="var(--c1)" />
              <KpiCard label="Promedio diario" value={nf(k.promedioDiario, 2)}
                hint={`Sobre ${nf(k.diasPeriodo)} días del período`} accent="var(--c2)" />
              <KpiCard label="Var. último mes"
                value={variacion === null ? "—" : `${variacion > 0 ? "+" : ""}${nf(variacion, 2)}%`}
                hint={ultimoMes ? `${cap(ultimoMes)} contra el mes previo` : ""}
                accent={variacion > 0 ? "var(--c5)" : "var(--c4)"} />
              <KpiCard label="Subcategoría principal" value={k.subTop?.name || "—"}
                hint={k.subTop ? `${nf(k.subTop.value)} de ${nf(k.total)} casos` : ""}
                accent="var(--c3)" />
            </section>

            <section className="charts-section" style={{ marginBottom: 20 }}>
              <div className="panel panel-wide">
                <h3>Evolución mensual</h3>
                <p className="panel-sub">{categoria}</p>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={data.porMes.map((m) => ({ ...m, label: cap(m.name) }))}
                    margin={{ left: -18, right: 16, top: 22 }}>
                    <defs>
                      <linearGradient id="fillCat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--c2)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--c2)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-3)" }} />
                    <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
                    <Tooltip {...tip} formatter={(v) => [v, "Incidentes"]} />
                    <Area type="monotone" dataKey="value" name="Incidentes" stroke="var(--c2)"
                      strokeWidth={2.5} fill="url(#fillCat)"
                      dot={{ r: 4, fill: "var(--c2)", stroke: "var(--surface)", strokeWidth: 2 }}>
                      <LabelList dataKey="value" position="top" offset={10}
                        style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }} />
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="panel panel-wide">
                <h3>Promedio por día de la semana</h3>
                <p className="panel-sub">
                  Divide por las veces que cayó cada día en el período, no por 7
                </p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.porDiaSemana.map((d) => ({ ...d, label: cap(d.name) }))}
                    margin={{ left: -20, right: 12, top: 22 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-3)" }} interval={0} />
                    <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} />
                    <Tooltip {...tip}
                      formatter={(v, n, p) => [`${nf(v, 2)} por día (${p.payload.total} en total)`, "Promedio"]} />
                    <Bar dataKey="value" name="Promedio" radius={[6, 6, 0, 0]} maxBarSize={54}
                      fill="var(--c2)">
                      <LabelList dataKey="value" position="top" offset={8}
                        formatter={(v) => nf(v, 1)}
                        style={{ fill: "var(--ink)", fontSize: 11, fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel panel-wide" style={{ marginBottom: 20 }}>
              <h3>Recurrencia territorial</h3>
              <p className="panel-sub">
                Percentiles P75/P90/P95 sobre {nf(k.camaras)} cámaras · el color indica la
                recurrencia relativa del punto, no un nivel de riesgo
              </p>

              {!data.clasificacionUtil && (
                <div className="banner-warning" style={{ marginBottom: 16 }}>
                  <strong>La clasificación no discrimina en esta categoría.</strong>
                  <br />
                  Los cortes caen en {nf(Math.ceil(data.cortes.p75))} / {nf(Math.ceil(data.cortes.p90))} /{" "}
                  {nf(Math.ceil(data.cortes.p95))} incidentes, así que dos o más clases quedan
                  pegadas. Hay muy pocos casos por cámara para que los percentiles separen algo.
                  Conviene leer el acumulado de cada punto antes que su color.
                </div>
              )}

              <div className="recurrencia-resumen">
                <span><b>{nf(k.camaras)}</b> cámaras con registros</span>
                <span><b>{nf(data.resumen.prioridad1)}</b> Prioridad 1</span>
                <span><b>{nf(data.resumen.prioridad2)}</b> Prioridad 2</span>
                <span>
                  Cortes: <b>{nf(data.cortes.p75, 2)}</b> / <b>{nf(data.cortes.p90, 2)}</b> /{" "}
                  <b>{nf(data.cortes.p95, 2)}</b> incidentes
                </span>
              </div>

              <RecurrenciaMap puntos={data.puntos} />
            </section>

            {priorizados.length > 0 ? (
              <section className="panel panel-wide" style={{ marginBottom: 20 }}>
                <h3>Puntos priorizados</h3>
                <p className="panel-sub">
                  Recurrencia alta o muy alta con persistencia ≥ {nf(data.persistenciaMinima)}% ·{" "}
                  {priorizados.length} puntos
                </p>
                <ResponsiveContainer width="100%" height={Math.max(300, priorizados.length * 32)}>
                  <BarChart data={priorizados} layout="vertical" margin={{ left: 8, right: 44 }}>
                    <CartesianGrid horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="ubicacion" width={250} interval={0}
                      tick={{ fontSize: 11, fill: "var(--ink-2)" }} />
                    <Tooltip cursor={{ fill: "var(--brand-050)" }} {...tip}
                      formatter={(v, n, p) =>
                        [`${v} incidentes · persistencia ${nf(p.payload.persistencia, 1)}% · ${p.payload.prioridad}`,
                          p.payload.dispositivo]} />
                    <Bar dataKey="svAcumulados" radius={[0, 6, 6, 0]} maxBarSize={22}>
                      {priorizados.map((p) => (
                        <Cell key={p.dispositivo} fill={COLOR_HEX[p.color] || COLOR_HEX["SIN SEÑAL"]} />
                      ))}
                      <LabelList dataKey="svAcumulados" position="right" offset={8}
                        style={{ fill: "var(--ink)", fontSize: 11, fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </section>
            ) : (
              <div className="banner-warning" style={{ marginBottom: 20 }}>
                Ningún punto de esta categoría combina recurrencia alta con persistencia ≥{" "}
                {nf(data.persistenciaMinima)}%, así que no hay candidatos a prueba piloto.
              </div>
            )}

            <div className="banner-warning">
              <strong>Sin distribución por franja horaria.</strong>
              <br />
              La base guarda la hora en formato de 12 horas sin AM/PM: coincide con la hora
              corregida del COMM solo en el 43% de los casos y todas las diferencias son de
              +12 horas. Graficarla daría franjas equivocadas para más de la mitad de los
              registros. Se habilita cuando el origen exporte la hora en formato de 24 horas.
            </div>
          </>
        )}
      </main>
    </div>
  );
}
