// RankingChart.jsx — ranking de puntos críticos por dirección (top 12).
// Equivale al gráfico de barras del Power BI: Eje Y = DIRECCION, X = recuento.

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LabelList,
} from "recharts";

const nf = (v) => (v ?? 0).toLocaleString("es-AR");
import { useNarrowScreen } from "../hooks/useNarrowScreen";
import {
  TOOLTIP, indiceMaximo, rellenoBarra, useIdsGrafico, defsGrafico, urlDe,
} from "../chartTheme";

export default function RankingChart({ data }) {
  // El eje Y de Recharts es un ancho fijo en px: en pantallas chicas hay que
  // achicarlo (y recortar la dirección) para que quede lugar a las barras.
  const narrow = useNarrowScreen();
  const ids = useIdsGrafico();

  const idxMax = indiceMaximo(data);

  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el filtro actual.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(360, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 64 }}>
        {defsGrafico(ids, { horizontal: true })}
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 5" />
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
            <Cell
              key={i}
              fill={rellenoBarra(ids, i, idxMax)}
              filter={i === idxMax ? urlDe(ids.brillo) : undefined}
            />
          ))}
          </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
