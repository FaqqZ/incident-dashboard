// TrendLineChart.jsx — evolución mensual. Recibe [{name:"enero", mesnro, value}]
// ya ordenado por número de mes desde el backend.
// El mes con más incidentes se marca en amarillo (ver chartTheme).

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList,
} from "recharts";
import { SERIE, MAXIMO, TOOLTIP, indiceMaximo, dotMaximo } from "../chartTheme";

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function TrendLineChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el filtro actual.</div>;
  }
  const shaped = data.map((d) => ({ ...d, label: cap(d.name) }));
  const idxMax = indiceMaximo(shaped);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={shaped} margin={{ left: -18, right: 30, top: 24 }}>
        <defs>
          <linearGradient id="fillSerie" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIE} stopOpacity={0.35} />
            <stop offset="100%" stopColor={SERIE} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 13, fill: "var(--ink-3)" }} />
        <YAxis tick={{ fontSize: 13, fill: "var(--ink-3)" }} allowDecimals={false} />
        <Tooltip {...TOOLTIP} formatter={(v) => [v, "Incidentes"]} />
        <Area type="monotone" dataKey="value" name="Incidentes" stroke={SERIE}
          strokeWidth={2.5} fill="url(#fillSerie)" isAnimationActive={false} dot={dotMaximo(idxMax)} activeDot={{ r: 7 }}>
          <LabelList dataKey="value" position="top" offset={11}
            content={({ x, y, value, index }) => (
              <text x={x} y={y} dy={-11} textAnchor="middle"
                fill={index === idxMax ? MAXIMO : "var(--ink)"}
                fontSize={index === idxMax ? 14 : 12}
                fontWeight={index === idxMax ? 700 : 600}>
                {(value ?? 0).toLocaleString("es-AR")}
              </text>
            )} />
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  );
}
