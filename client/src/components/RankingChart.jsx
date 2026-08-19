// RankingChart.jsx — ranking de puntos críticos por dirección (top 12).
// Equivale al gráfico de barras del Power BI: Eje Y = DIRECCION, X = recuento.

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LabelList,
} from "recharts";

const nf = (v) => (v ?? 0).toLocaleString("es-AR");
import { useNarrowScreen } from "../hooks/useNarrowScreen";
import { TOOLTIP, indiceMaximo, colorSegunMaximo } from "../chartTheme";

export default function RankingChart({ data }) {
  // El eje Y de Recharts es un ancho fijo en px: en pantallas chicas hay que
  // achicarlo (y recortar la dirección) para que quede lugar a las barras.
  const narrow = useNarrowScreen();

  const idxMax = indiceMaximo(data);

  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el filtro actual.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(360, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 64 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={narrow ? 130 : 280}
          tickFormatter={(v) => (narrow && v?.length > 18 ? `${v.slice(0, 17)}…` : v)}
          tick={{ fontSize: narrow ? 11 : 12, fill: "var(--ink-2)" }} interval={0} />
        <Tooltip cursor={{ fill: "var(--brand-050)" }} {...TOOLTIP}
          formatter={(v) => [v, "Incidentes"]} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26} isAnimationActive={false}>
          <LabelList dataKey="value" position="right" offset={8}
            formatter={nf} style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }} />
          {data.map((_, i) => (
            <Cell key={i} fill={colorSegunMaximo(i, idxMax)} />
          ))}
          </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
