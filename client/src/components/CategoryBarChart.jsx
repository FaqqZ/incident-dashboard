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
} from "recharts";
import { useFilters } from "../store/useFilters";
import { useNarrowScreen } from "../hooks/useNarrowScreen";

const PALETTE = [
  "var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)",
  "var(--c5)", "var(--c6)", "var(--c7)", "var(--c8)",
];

export default function CategoryBarChart({ data }) {
  const { filters, toggleFilter } = useFilters();
  const narrow = useNarrowScreen();

  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el filtro actual.</div>;
  }

  // Alto proporcional a la cantidad de categorías, con piso y techo: el backend
  // no limita la lista y puede devolver ~30.
  const height = Math.min(760, Math.max(320, data.length * 46));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={narrow ? 120 : 190}
          interval={0}
          tick={{ fontSize: narrow || data.length > 14 ? 11 : 13, fill: "var(--ink-2)" }}
        />
        <Tooltip
          cursor={{ fill: "var(--brand-050)" }}
          contentStyle={{
            borderRadius: 10,
            border: "1px solid var(--border)",
            fontSize: 13,
            background: "var(--surface-2)",
          }}
          labelStyle={{ color: "var(--ink-2)" }}
          itemStyle={{ color: "var(--ink)" }}
        />
        <Bar
          dataKey="value"
          radius={[0, 6, 6, 0]}
          maxBarSize={34}
          cursor="pointer"
          onClick={(d) => toggleFilter("categoria", d.name)}
        >
          {data.map((entry, i) => {
            const active = !filters.categoria || filters.categoria === entry.name;
            return (
              <Cell
                key={entry.name}
                fill={PALETTE[i % PALETTE.length]}
                fillOpacity={active ? 1 : 0.28}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
