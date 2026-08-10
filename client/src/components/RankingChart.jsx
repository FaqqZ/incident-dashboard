// RankingChart.jsx — ranking de puntos críticos por dirección (top 12).
// Equivale al gráfico de barras del Power BI: Eje Y = DIRECCION, X = recuento.

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";
import { useNarrowScreen } from "../hooks/useNarrowScreen";

export default function RankingChart({ data }) {
  // El eje Y de Recharts es un ancho fijo en px: en pantallas chicas hay que
  // achicarlo (y recortar la dirección) para que quede lugar a las barras.
  const narrow = useNarrowScreen();

  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el filtro actual.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(360, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 32 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={narrow ? 130 : 280}
          tickFormatter={(v) => (narrow && v?.length > 18 ? `${v.slice(0, 17)}…` : v)}
          tick={{ fontSize: narrow ? 11 : 12, fill: "var(--ink-2)" }} interval={0} />
        <Tooltip cursor={{ fill: "var(--brand-050)" }}
          contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 13,
            background: "var(--surface-2)" }}
          labelStyle={{ color: "var(--ink-2)" }} itemStyle={{ color: "var(--ink)" }}
          formatter={(v) => [v, "Incidentes"]} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === 0 ? "var(--c5)" : "var(--brand)"}
              fillOpacity={i === 0 ? 1 : 0.55 + (0.45 * (data.length - i)) / data.length} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
