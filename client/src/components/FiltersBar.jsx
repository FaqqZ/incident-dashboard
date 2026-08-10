// FiltersBar.jsx — slicers: categoría, turno, mes y rango de fechas (modo "Entre").
import { useFilters } from "../store/useFilters";

export default function FiltersBar({ options }) {
  const { filters, setFilter, reset, hasActiveFilters } = useFilters();
  const { categorias = [], turnos = [], meses = [], naturalezas = [], rangoFechas = {} } = options || {};

  return (
    <div className="filters" id="filtros-bar">
      <div className="field">
        <label htmlFor="f-cat">Categoría</label>
        <select id="f-cat" value={filters.categoria} onChange={(e) => setFilter("categoria", e.target.value)}>
          <option value="">Todas</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-turno">Turno</label>
        <select id="f-turno" value={filters.turno} onChange={(e) => setFilter("turno", e.target.value)}>
          <option value="">Todos</option>
          {turnos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-naturaleza">Naturaleza</label>
        <select id="f-naturaleza" value={filters.naturaleza} onChange={(e) => setFilter("naturaleza", e.target.value)}>
          <option value="">Todas</option>
          {naturalezas.map((n) => <option key={n} value={n}>{n}</option>)}
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
