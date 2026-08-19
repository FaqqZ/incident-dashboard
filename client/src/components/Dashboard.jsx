// Dashboard.jsx — vista ejecutiva del panel (ruta "/")
// Extraído de App.jsx para permitir ruteo entre vistas

import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { fetchDashboard, fetchOptions } from "../api";
import { useFilters } from "../store/useFilters";
import { useDataVersion } from "../store/useDataVersion";
import FiltersBar from "./FiltersBar";
import KpiCard from "./KpiCard";
import CategoryBarChart from "./CategoryBarChart";
import RankingChart from "./RankingChart";
import TrendLineChart from "./TrendLineChart";
import RecurrenciaMap from "./RecurrenciaMap";
import ExportButton from "./ExportButton";

const nf = (n, d = 0) =>
  (n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function Dashboard() {
  const { filters } = useFilters();
  const { dataVersion } = useDataVersion();
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    fetchOptions().then(setOptions).catch(() => setOptions(null));
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetchDashboard(filters)
        .then((d) => { setData(d); setError(null); })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(debounceRef.current);
  }, [filters, dataVersion]);

  const k = data?.kpis;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          {/* Versión negativa del membrete: el original tiene el texto en negro
              y sobre el navy no se lee. logo-smt.png guarda el archivo intacto. */}
          <img
            className="logo"
            src="/logo-smt-negativo.png"
            alt="Ciudad SMT · Subsecretaría de Seguridad Ciudadana"
          />
          <span className="brand-divider" aria-hidden="true" />
          <h1>Panel Operativo de Incidentes</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {data && <span className="updated">{nf(data.totalFiltrado)} incidentes en vista</span>}
          <Link to="/analisis" className="btn" style={{ fontSize: "12px" }}>
            Análisis por categoría
          </Link>
          <Link to="/siniestros-viales" className="btn" style={{ fontSize: "12px" }}>
            Siniestros viales
          </Link>
          <Link to="/datos" className="btn" style={{ fontSize: "12px" }}>Gestión de datos</Link>
          <ExportButton />
        </div>
      </header>

      <main className="canvas">
        <FiltersBar options={options} />

        {error && (
          <div className="banner-error">
            No se pudieron cargar los datos: {error}. Revisá que el servidor esté corriendo y
            que el Excel tenga las hojas <b>bd</b> y <b>coordenadas-cam-actualizado</b>.
          </div>
        )}

        {loading && !data ? (
          <div className="state"><div className="spinner" /><div className="big">Cargando datos operativos…</div></div>
        ) : (
          data && (
            <div id="export-area">
              {/* --- Titulares (cards) --- */}
              <section className="kpi-grid">
                <KpiCard label="Total incidentes" value={nf(k.total)}
                  hint="Período y filtros activos" accent="var(--c1)" />
                <KpiCard label="Categoría principal" value={k.categoriaTop?.name || "—"}
                  hint={k.categoriaTop ? `${nf(k.categoriaTop.count)} casos` : ""} accent="var(--c5)" />
                <KpiCard label="Punto crítico" value={k.puntoTop?.direccion || "—"}
                  hint={k.puntoTop ? `${nf(k.puntoTop.count)} casos · ${k.puntoTop.dispositivo}` : ""}
                  accent="var(--c3)" />
              </section>

              {/* --- Mapa a todo el ancho (protagonista) --- */}
              {/* Mismo tipo de vista que siniestros viales: puntos discretos
                  clasificados por recurrencia, no un mapa de calor difuminado. */}
              <section className="map-section">
                <div className="panel panel-full-width">
                  <h3>Recurrencia territorial de incidentes</h3>
                  <p className="panel-sub">
                    Percentiles P75/P90/P95 sobre {nf(data.puntos.length)} cámaras de la vista
                    actual · el color indica la recurrencia relativa del punto, no un nivel de
                    riesgo
                  </p>

                  {!data.clasificacionUtil && (
                    <div className="banner-warning" style={{ marginBottom: 16 }}>
                      <strong>La clasificación no discrimina con este filtro.</strong> Los cortes
                      caen en {nf(Math.ceil(data.cortes.p75))} / {nf(Math.ceil(data.cortes.p90))} /{" "}
                      {nf(Math.ceil(data.cortes.p95))} incidentes, así que dos o más clases quedan
                      pegadas. Conviene leer el acumulado de cada punto antes que su color.
                    </div>
                  )}

                  <div className="recurrencia-resumen">
                    <span><b>{nf(data.puntos.length)}</b> cámaras con registros</span>
                    <span>
                      Cortes: <b>{nf(data.cortes.p75, 2)}</b> / <b>{nf(data.cortes.p90, 2)}</b> /{" "}
                      <b>{nf(data.cortes.p95, 2)}</b> incidentes
                    </span>
                  </div>

                  <RecurrenciaMap puntos={data.puntos} />
                </div>
              </section>

              {/* --- Gráficos estadísticos --- */}
              {/* Los de barras horizontales (categoría, puntos críticos) van a
                  ancho completo: necesitan espacio para las etiquetas. */}
              <section className="charts-section">
                <div className="panel panel-wide">
                  <h3>Evolución mensual</h3>
                  <p className="panel-sub">Incidentes por mes (enero → julio)</p>
                  <TrendLineChart data={data.porMes} />
                </div>

                <div className="panel panel-wide">
                  <h3>Incidentes por categoría</h3>
                  <p className="panel-sub">Tocá una barra para filtrar todo el tablero</p>
                  <CategoryBarChart data={data.porCategoria} />
                </div>

                <div className="panel panel-wide">
                  <h3>Puntos críticos</h3>
                  <p className="panel-sub">Direcciones con más incidentes (top 12)</p>
                  <RankingChart data={data.rankingPuntos} />
                </div>
              </section>
            </div>
          )
        )}
      </main>
    </div>
  );
}
