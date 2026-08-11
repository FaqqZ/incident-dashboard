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
      {/* right holgado: la etiqueta de valor va del lado de afuera de la barra */}
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 64 }}>
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
