// FiltersBar.jsx — slicers: naturaleza, categoría, mes y rango de fechas.
// El orden de los campos es el pedido por Seguridad Ciudadana: se arranca por
// naturaleza (Seguridad / Municipal) porque es la que más recorta la base.
import { useFilters } from "../store/useFilters";

export default function FiltersBar({ options }) {
  const { filters, setFilter, reset, hasActiveFilters } = useFilters();
  const {
    categorias = [], meses = [], naturalezas = [], rangoFechas = {},
    subcategorias = [], subcategoriasPorCategoria = {},
  } = options || {};

  // Son 85 subcategorías en total: con una categoría elegida se muestran solo
  // las suyas, que es la lista con la que se puede trabajar de verdad.
  const subcategoriasVisibles = filters.categoria
    ? subcategoriasPorCategoria[filters.categoria] || []
    : subcategorias;

  return (
    <div className="filters" id="filtros-bar">
      <div className="field">
        <label htmlFor="f-naturaleza">Naturaleza</label>
        <select id="f-naturaleza" value={filters.naturaleza} onChange={(e) => setFilter("naturaleza", e.target.value)}>
          <option value="">Todas</option>
          {naturalezas.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-cat">Categoría</label>
        <select id="f-cat" value={filters.categoria} onChange={(e) => setFilter("categoria", e.target.value)}>
          <option value="">Todas</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-subcat">Subcategoría</label>
        <select id="f-subcat" value={filters.subcategoria}
          onChange={(e) => setFilter("subcategoria", e.target.value)}>
          <option value="">Todas</option>
          {subcategoriasVisibles.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-mes">Mes</label>
        <select id="f-mes" value={filters.mes} onChange={(e) => setFilter("mes", e.target.value)}>
          <option value="">Todos</option>
          {meses.map((m) => <option key={m} value={m} style={{ textTransform: "capitalize" }}>{m}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-desde">Desde</label>
        <input id="f-desde" type="date" value={filters.from}
          min={rangoFechas.min || undefined} max={rangoFechas.max || undefined}
          onChange={(e) => setFilter("from", e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="f-hasta">Hasta</label>
        <input id="f-hasta" type="date" value={filters.to}
          min={rangoFechas.min || undefined} max={rangoFechas.max || undefined}
          onChange={(e) => setFilter("to", e.target.value)} />
      </div>

      <div className="spacer" />
      <button className="btn" onClick={reset} disabled={!hasActiveFilters()}
        style={{ opacity: hasActiveFilters() ? 1 : 0.5 }}>
        Limpiar filtros
      </button>
    </div>
  );
}
