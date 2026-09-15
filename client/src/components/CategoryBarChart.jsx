// CategoryBarChart.jsx — incidentes por categoría.
// Click en una barra = filtra todo el tablero por esa categoría (toggle).

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
  LabelList,
} from "recharts";

const nf = (v) => (v ?? 0).toLocaleString("es-AR");
import { useFilters } from "../store/useFilters";
import { useNarrowScreen } from "../hooks/useNarrowScreen";
import {
  TOOLTIP, indiceMaximo, rellenoBarra, useIdsGrafico, defsGrafico, urlDe,
} from "../chartTheme";

export default function CategoryBarChart({ data }) {
  const { filters, toggleFilter } = useFilters();
  const narrow = useNarrowScreen();
  const ids = useIdsGrafico();

  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el filtro actual.</div>;
  }

  // Alto proporcional a la cantidad de categorías, con piso y techo: el backend
  // no limita la lista y puede devolver ~30.
  const height = Math.min(760, Math.max(320, data.length * 46));
  const idxMax = indiceMaximo(data);

  return (
    <ResponsiveContainer width="100%" height={height}>
      {/* right holgado: la etiqueta de valor va del lado de afuera de la barra */}
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 64 }}>
        {defsGrafico(ids, { horizontal: true })}
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 5" />
        <XAxis type="number" tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={narrow ? 120 : 190}
          interval={0}
          tick={{ fontSize: narrow || data.length > 14 ? 11 : 13, fill: "var(--ink-2)" }}
        />
        <Tooltip cursor={{ fill: "var(--brand-050)" }} {...TOOLTIP} />
        <Bar
          dataKey="value"
          radius={[0, 6, 6, 0]}
          maxBarSize={34}
          isAnimationActive={false}
          cursor="pointer"
          onClick={(d) => toggleFilter("categoria", d.name)}
        >
          <LabelList dataKey="value" position="right" offset={8}
            formatter={nf} style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }} />
          {data.map((entry, i) => {
            const active = !filters.categoria || filters.categoria === entry.name;
            return (
              <Cell
                key={entry.name}
                fill={rellenoBarra(ids, i, idxMax)}
                fillOpacity={active ? 1 : 0.26}
                filter={i === idxMax && active ? urlDe(ids.brillo) : undefined}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
