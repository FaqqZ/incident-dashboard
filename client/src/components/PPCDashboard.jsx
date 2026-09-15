// PPCDashboard.jsx — tablero de la Patrulla de Protección Ciudadana.
//
// SIN MAPA, y no por una decisión de diseño: la base de la PPC llega agregada
// por mes y tipo de intervención, sin domicilio ni coordenadas. No hay nada
// que georreferenciar (ver server/ppcReader.js).
//
// Por la misma razón no hay filtro de fechas por día, ni turno, ni franja
// horaria: la unidad mínima del dato es el mes.

import { useEffect, useState } from "react";
import { fetchPPC, fetchPPCOptions } from "../api";
import TopBar from "./TopBar";
import KpiCard from "./KpiCard";
import TrendLineChart from "./TrendLineChart";
import BarrasPorTipo from "./BarrasPorTipo";
import MiniSeries from "./MiniSeries";
import MatrizMesTipo from "./MatrizMesTipo";

const nf = (n, d = 0) =>
  (n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Un solo mes, no un rango: elegir "enero" tiene que mostrar el total de enero.
// Con Desde/Hasta, elegir solo "Desde: enero" mostraba el acumulado del año.
const SIN_FILTROS = { tipo: "", mes: "" };

export default function PPCDashboard() {
  const [filtros, setFiltros] = useState(SIN_FILTROS);
  const [opciones, setOpciones] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPPCOptions().then(setOpciones).catch(() => setOpciones(null));
  }, []);

  useEffect(() => {
    setLoading(true);
    // La API trabaja con rango: un mes es el rango que empieza y termina en él.
    fetchPPC({ tipo: filtros.tipo, mesDesde: filtros.mes, mesHasta: filtros.mes })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filtros]);

  const set = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));
  // Click en una barra o en un mini gráfico: elige el tipo, o lo suelta si ya
  // estaba elegido.
  const alternarTipo = (t) => setFiltros((f) => ({ ...f, tipo: f.tipo === t ? "" : t }));
  const hayFiltros = Boolean(filtros.tipo || filtros.mes);

  const k = data?.kpis;
  const meses = opciones?.meses || [];

  return (
    <div className="app">
      <TopBar
        titulo="Patrulla de Protección Ciudadana"
        resumen={data ? `${nf(k.total)} intervenciones en vista` : null}
        menu={[{ to: "/", label: "Cambiar de área" }]}
      />

      <main className="canvas">
        <div className="filters">
          <div className="field">
            <label htmlFor="ppc-tipo">Tipo de intervención</label>
            <select id="ppc-tipo" value={filtros.tipo} onChange={(e) => set("tipo", e.target.value)}>
              <option value="">Todos</option>
              {(opciones?.tipos || []).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="ppc-mes">Mes</label>
            <select id="ppc-mes" value={filtros.mes} onChange={(e) => set("mes", e.target.value)}>
              <option value="">Todos</option>
              {meses.map((m) => <option key={m} value={m}>{cap(m)}</option>)}
            </select>
          </div>

          <div className="spacer" />
          <button className="btn" onClick={() => setFiltros(SIN_FILTROS)} disabled={!hayFiltros}
            style={{ opacity: hayFiltros ? 1 : 0.5 }}>
            Limpiar filtros
          </button>
        </div>

        {error && (
          <div className="banner-error">
            No se pudieron cargar los datos de la Patrulla: {error}. Revisá que el servidor
            esté corriendo y que <code>server/data/ppc.xlsx</code> tenga la matriz de meses
            por tipo de intervención.
          </div>
        )}

        {loading && !data ? (
          <div className="state"><div className="spinner" /><div className="big">Cargando datos de la Patrulla…</div></div>
        ) : (
          data && (
            <>
              {/* Si los totales del Excel no cuadran con la suma de los tipos,
                  conviene avisarlo antes de que alguien cite un número. */}
              {data.meta.totalCoincide === false && (
                <div className="banner-warning" style={{ marginBottom: 16 }}>
                  <strong>Los totales del Excel no cuadran.</strong> La columna
                  “{data.meta.columnaTotal}” no coincide con la suma de los tipos en todos
                  los meses. El tablero muestra la suma recalculada.
                </div>
              )}

              <section className="kpi-grid">
                <KpiCard label="Intervenciones" value={nf(k.total)}
                  hint={[filtros.tipo, filtros.mes ? cap(filtros.mes) : `${k.mesesObservados} meses en vista`]
                    .filter(Boolean).join(" · ")}
                  accent="var(--c1)" />
                {/* Con un mes elegido el promedio mensual repetiría el total:
                    ahí sirve el diario. */}
                {filtros.mes ? (
                  <KpiCard label="Promedio diario" value={nf(k.promedioDiario, 1)}
                    hint={`Sobre ${nf(k.dias)} días de ${cap(filtros.mes)}`}
                    accent="var(--c2)" />
                ) : (
                  <KpiCard label="Promedio mensual" value={nf(k.promedioMensual)}
                    hint={`${nf(k.promedioDiario, 1)} por día · ${nf(k.dias)} días`}
                    accent="var(--c2)" />
                )}
                <KpiCard label="Tipo predominante" value={k.tipoTop?.name || "—"}
                  hint={k.tipoTop ? `${nf(k.tipoTop.value)} · ${nf(k.tipoTop.pct, 1)}% del período` : ""}
                  accent="var(--c3)" />
                {/* Con un mes elegido el "mes pico" sería ese mismo mes. */}
                {!filtros.mes && (
                  <KpiCard label="Mes pico" value={cap(k.mesPico?.name) || "—"}
                    hint={k.mesPico ? `${nf(k.mesPico.value)} intervenciones` : ""}
                    accent="var(--c4)" />
                )}
                {k.variacion && (
                  <KpiCard
                    label={`${cap(k.variacion.mes)} vs ${cap(k.variacion.contra)}`}
                    value={k.variacion.pct === null
                      ? "—"
                      : `${k.variacion.pct > 0 ? "+" : ""}${nf(k.variacion.pct, 1)}%`}
                    hint={`${nf(k.variacion.anterior)} → ${nf(k.variacion.valor)}`}
                    accent="var(--c5)" />
                )}
              </section>

              {/* La proporción preventivo/respuesta solo tiene sentido con
                  todos los tipos a la vista: con uno elegido no hay proporción
                  que mostrar, sino un único número. */}
              {!filtros.tipo && k.preventivo.valor > 0 && (
                <section className="panel panel-wide" style={{ marginBottom: 16 }}>
                  <h3>Presencia preventiva y respuesta</h3>
                  <p className="panel-sub">
                    Prevención es el único tipo de despliegue planificado; los otros ocho son
                    respuesta a un hecho ya ocurrido
                  </p>
                  <div>
                    <div className="split-barra">
                      <span className="split-prev" style={{ width: `${k.preventivo.pct}%` }} />
                      <span className="split-resp" style={{ width: `${100 - k.preventivo.pct}%` }} />
                    </div>
                    <div className="split-leyenda">
                      <span>
                        <i className="split-punto prev" /> Prevención{" "}
                        <b>{nf(k.preventivo.valor)}</b> ({nf(k.preventivo.pct, 1)}%)
                      </span>
                      <span>
                        <i className="split-punto resp" /> Respuesta{" "}
                        <b>{nf(k.preventivo.respuesta)}</b> ({nf(100 - k.preventivo.pct, 1)}%)
                      </span>
                    </div>
                  </div>
                </section>
              )}

              <section className="charts-section">
                <div className="panel panel-wide">
                  <h3>Evolución mensual</h3>
                  <p className="panel-sub">
                    {filtros.tipo ? `${filtros.tipo} por mes` : "Total de intervenciones por mes"}
                    {data.porMes.length
                      ? ` (${cap(data.porMes[0].name)} → ${cap(data.porMes[data.porMes.length - 1].name)})`
                      : ""}
                  </p>
                  <TrendLineChart data={data.porMes} etiqueta="Intervenciones" />
                </div>

                <div className="panel panel-wide">
                  <h3>Intervenciones por tipo</h3>
                  <p className="panel-sub">
                    Acumulado del período · tocá una barra para filtrar la vista
                  </p>
                  <BarrasPorTipo data={data.porTipo} seleccionado={filtros.tipo}
                    onSelect={alternarTipo} />
                </div>

                <div className="panel panel-wide">
                  <h3>Evolución por tipo</h3>
                  <p className="panel-sub">
                    Cada tipo con su propia escala: sirve para comparar la forma de cada
                    serie, no su altura. El mes pico va en amarillo
                  </p>
                  {filtros.mes ? (
                    <div className="state">
                      Con un solo mes no hay evolución que mostrar. Elegí “Todos” en Mes para
                      ver cómo se movió cada tipo.
                    </div>
                  ) : (
                    <MiniSeries series={data.serieTipos} seleccionado={filtros.tipo}
                      onSelect={alternarTipo} />
                  )}
                </div>

                <div className="panel panel-wide">
                  <h3>Detalle mensual por tipo</h3>
                  <p className="panel-sub">
                    La planilla como la entrega la Patrulla · la intensidad se calcula dentro
                    de cada columna y el mes pico de cada tipo va en amarillo
                  </p>
                  <MatrizMesTipo matriz={data.matriz} seleccionado={filtros.tipo}
                    onSelect={alternarTipo} />
                </div>
              </section>

              <p className="panel-sub" style={{ marginTop: 18 }}>
                Fuente: <code>{data.meta.archivo.split("/").pop()}</code>, hoja
                “{data.meta.hoja}” · {data.meta.periodo} · {data.meta.tiposDetectados} tipos
                de intervención.
              </p>
            </>
          )
        )}
      </main>
    </div>
  );
}
