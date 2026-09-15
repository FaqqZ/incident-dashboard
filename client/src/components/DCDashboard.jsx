// DCDashboard.jsx — tablero de Defensa Civil.
//
// SIN MAPA, igual que la Patrulla y por el mismo motivo: la fuente es la hoja
// "Resumen Mensual", que llega ya agregada por mes. No hay domicilio ni
// coordenadas que ubicar (ver server/dcReader.js).
//
// La diferencia con la PPC es que acá hay DOS desgloses —qué pasó (categoría)
// y a quién se derivó (organismo)— que la planilla da por separado y NO se
// pueden cruzar. Por eso se elige uno por vez: si se pudieran marcar los dos a
// la vez, el tablero estaría afirmando una intersección que el dato no tiene.
//
// Los gráficos son distintos a los de la Patrulla a propósito: acá la pregunta
// es qué PARTE del total se lleva cada categoría y cómo se movió esa
// composición, así que son anillos + evolución en el tiempo. La Patrulla
// rankea nueve tipos, y para eso las barras son mejores.

import { useEffect, useState } from "react";
import { fetchDC, fetchDCOptions } from "../api";
import TopBar from "./TopBar";
import KpiCard from "./KpiCard";
import TrendLineChart from "./TrendLineChart";
import TortaDistribucion from "./TortaDistribucion";
import EvolucionApilada from "./EvolucionApilada";

const nf = (n, d = 0) =>
  (n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const SIN_FILTROS = { dimension: "", valor: "", mesDesde: "", mesHasta: "" };

export default function DCDashboard() {
  const [filtros, setFiltros] = useState(SIN_FILTROS);
  const [opciones, setOpciones] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDCOptions().then(setOpciones).catch(() => setOpciones(null));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchDC(filtros)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filtros]);

  // Elegir una dimensión suelta la otra: la planilla no permite cruzarlas.
  const elegir = (dimension, valor) =>
    setFiltros((f) => ({
      ...f,
      dimension: valor ? dimension : "",
      valor: valor || "",
    }));
  const alternar = (dimension) => (v) =>
    setFiltros((f) => ({
      ...f,
      dimension: f.dimension === dimension && f.valor === v ? "" : dimension,
      valor: f.dimension === dimension && f.valor === v ? "" : v,
    }));

  const setMes = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));
  const hayFiltros = Boolean(filtros.valor || filtros.mesDesde || filtros.mesHasta);

  const catSel = filtros.dimension === "categoria" ? filtros.valor : "";
  const orgSel = filtros.dimension === "organismo" ? filtros.valor : "";

  const k = data?.kpis;
  const meses = opciones?.meses || [];
  const m = data?.meta;

  return (
    <div className="app">
      <TopBar
        titulo="Defensa Civil"
        resumen={data ? `${nf(k.total)} denuncias en vista` : null}
        menu={[{ to: "/", label: "Cambiar de área" }]}
      />

      <main className="canvas">
        <div className="filters">
          <div className="field">
            <label htmlFor="dc-cat">Categoría de denuncia</label>
            <select id="dc-cat" value={catSel} onChange={(e) => elegir("categoria", e.target.value)}>
              <option value="">Todas</option>
              {(opciones?.categorias || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="dc-org">Organismo derivado</label>
            <select id="dc-org" value={orgSel} onChange={(e) => elegir("organismo", e.target.value)}>
              <option value="">Todos</option>
              {(opciones?.organismos || []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="dc-desde">Desde</label>
            <select id="dc-desde" value={filtros.mesDesde}
              onChange={(e) => setMes("mesDesde", e.target.value)}>
              <option value="">Primer mes</option>
              {meses.map((x) => <option key={x} value={x}>{cap(x)}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="dc-hasta">Hasta</label>
            <select id="dc-hasta" value={filtros.mesHasta}
              onChange={(e) => setMes("mesHasta", e.target.value)}>
              <option value="">Último mes</option>
              {meses.map((x) => <option key={x} value={x}>{cap(x)}</option>)}
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
            No se pudieron cargar los datos de Defensa Civil: {error}. Revisá que el servidor
            esté corriendo y que <code>server/data/defensa-civil.xlsx</code> tenga la hoja
            “Resumen Mensual” con sus dos matrices.
          </div>
        )}

        {loading && !data ? (
          <div className="state"><div className="spinner" /><div className="big">Cargando datos de Defensa Civil…</div></div>
        ) : (
          data && (
            <>
              {(!m.netoCuadra || !m.totalCuadra) && (
                <div className="banner-error" style={{ marginBottom: 16 }}>
                  <strong>Los totales de la planilla no cuadran.</strong> La suma de las filas
                  no coincide con el “Subtotal operativo neto” o el “Total general” que trae la
                  hoja. El tablero muestra la suma recalculada; conviene revisar el Excel antes
                  de citar estos números.
                </div>
              )}

              {m.mesesEnConflicto.length > 0 && (
                <div className="banner-warning" style={{ marginBottom: 16 }}>
                  <strong>Un mes está rotulado distinto en cada matriz.</strong>{" "}
                  {m.mesesEnConflicto.map((c) => (
                    <span key={c.posicion}>
                      la columna {c.posicion} figura como <b>{cap(c.categorias)}</b> en la tabla de
                      categorías y como <b>{cap(c.derivaciones)}</b> en la de derivaciones
                    </span>
                  ))}
                  . Son la misma columna —{m.alineacionVerificada
                    ? "los subtotales de las dos matrices coinciden valor por valor, así que se alinean por posición"
                    : "⚠️ pero los subtotales NO coinciden, así que la alineación no está verificada"}—
                  y el tablero usa el rótulo de la tabla de categorías. Hay que corregirlo en la
                  planilla para saber cuál es el mes real.
                </div>
              )}

              {m.fueraDeTaxonomia.length > 0 && (
                <div className="banner-warning" style={{ marginBottom: 16 }}>
                  <strong>
                    {m.fueraDeTaxonomia.length} etiquetas quedaron fuera de las 16 categorías del
                    clasificador
                  </strong>{" "}
                  ({nf(m.fueraDeTaxonomia.reduce((a, f) => a + f.total, 0))} denuncias en total):{" "}
                  {m.fueraDeTaxonomia.map((f) => `${f.etiqueta} (${f.total})`).join(", ")}. Los
                  conteos se respetan tal cual vienen; lo que hay que corregir es la etiqueta.
                </div>
              )}

              <section className="kpi-grid">
                <KpiCard label="Denuncias" value={nf(k.total)}
                  hint={filtros.valor ? `${filtros.valor} · ${m.periodoEnVista}` : m.periodoEnVista}
                  accent="var(--c1)" />
                <KpiCard label="Por mes" value={nf(k.promedioMensual)}
                  hint={`Promedio de ${k.mesesObservados} meses`}
                  accent="var(--c2)" />
                <KpiCard label="Categoría top" value={k.categoriaTop?.name || "—"}
                  hint={k.categoriaTop ? `${nf(k.categoriaTop.value)} denuncias` : ""}
                  accent="var(--c3)" />
                <KpiCard label="Organismo top" value={k.organismoTop?.name || "—"}
                  hint={k.organismoTop ? `${nf(k.organismoTop.value)} derivaciones` : ""}
                  accent="var(--c4)" />
                <KpiCard label="Mes pico" value={cap(k.mesPico?.name) || "—"}
                  hint={k.mesPico ? `${nf(k.mesPico.value)} denuncias` : ""}
                  accent="var(--c6)" />
                {k.variacion && (
                  <KpiCard
                    label="Último mes"
                    value={k.variacion.pct === null
                      ? "—"
                      : `${k.variacion.pct > 0 ? "+" : ""}${nf(k.variacion.pct, 1)}%`}
                    hint={`${cap(k.variacion.contra)} ${nf(k.variacion.anterior)} → ${cap(k.variacion.mes)} ${nf(k.variacion.valor)}`}
                    accent="var(--c5)" />
                )}
              </section>

              {/* Sin selección: qué parte del libro de guardia son denuncias y
                  qué parte son asientos de apertura y cierre. Con una categoría
                  u organismo elegido no hay proporción, hay un único número. */}
              {!filtros.valor && k.interno > 0 && (
                <section className="panel panel-wide" style={{ marginBottom: 16 }}>
                  <h3>Denuncias y registro interno</h3>
                  <p className="panel-sub">
                    El libro de guardia asienta {nf(k.totalGeneral)} entradas, pero las de
                    apertura y cierre de turno no son denuncias. La separación es la que hace la
                    propia planilla con su “Subtotal operativo neto”
                  </p>
                  <div>
                    <div className="split-barra">
                      <span className="split-prev" style={{ width: `${100 - k.pctInterno}%` }} />
                      <span className="split-resp" style={{ width: `${k.pctInterno}%` }} />
                    </div>
                    <div className="split-leyenda">
                      <span>
                        <i className="split-punto prev" /> Denuncias <b>{nf(k.neto)}</b>{" "}
                        ({nf(100 - k.pctInterno, 1)}%)
                      </span>
                      <span>
                        <i className="split-punto resp" /> Registro operativo interno{" "}
                        <b>{nf(k.interno)}</b> ({nf(k.pctInterno, 1)}%)
                      </span>
                    </div>
                  </div>
                </section>
              )}

              <section className="charts-section">
                <div className="panel panel-wide">
                  <h3>Evolución mensual</h3>
                  <p className="panel-sub">
                    {filtros.valor ? `${filtros.valor} por mes` : "Denuncias por mes"}
                    {data.porMes.length
                      ? ` (${cap(data.porMes[0].name)} → ${cap(data.porMes[data.porMes.length - 1].name)})`
                      : ""}
                  </p>
                  <TrendLineChart data={data.porMes} etiqueta="Denuncias" />
                </div>

                {/* Las dos tortas van a la par: son las dos caras del mismo
                    período —qué pasó y a quién se derivó— y conviene leerlas
                    juntas aunque la planilla no las deje cruzar. */}
                <div className="charts-grid">
                  <div className="panel">
                    <h3>Composición por categoría</h3>
                    <p className="panel-sub">
                      Qué parte del total se lleva cada tipo de denuncia · tocá una porción
                      para filtrar
                    </p>
                    <TortaDistribucion data={data.porCategoria} seleccionado={catSel}
                      onSelect={alternar("categoria")} etiqueta="Denuncias" tope={8} />
                  </div>

                  <div className="panel">
                    <h3>Composición por organismo</h3>
                    <p className="panel-sub">
                      A quién se derivó · elegir un organismo suelta la categoría, porque la
                      planilla no dice qué categoría fue a cuál
                    </p>
                    <TortaDistribucion data={data.porOrganismo} seleccionado={orgSel}
                      onSelect={alternar("organismo")} etiqueta="Derivaciones" tope={8} />
                  </div>
                </div>

                <div className="panel panel-wide">
                  <h3>Evolución de la composición</h3>
                  <p className="panel-sub">
                    El borde de arriba es el total del mes y cada franja es lo que aportó cada
                    categoría · sirve para ver si la mezcla cambió, no solo el volumen
                  </p>
                  <EvolucionApilada series={data.serieCategorias} tope={6} />
                </div>
              </section>

              <p className="panel-sub" style={{ marginTop: 18 }}>
                Fuente: <code>{m.archivo.split("/").pop()}</code>, hoja “{m.hoja}” ·{" "}
                {m.mesesObservados} meses · {m.categoriasDetectadas} categorías y{" "}
                {m.organismosDetectados} organismos.
                {m.vacios.organismos.length > 0 &&
                  ` No se grafican ${m.vacios.organismos.join(" ni ")}: figuran en la planilla sin ningún registro.`}
              </p>
            </>
          )
        )}
      </main>
    </div>
  );
}
