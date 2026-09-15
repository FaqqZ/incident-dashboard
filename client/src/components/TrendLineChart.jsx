// TrendLineChart.jsx — evolución mensual. Recibe [{name:"enero", mesnro, value}]
// ya ordenado por número de mes desde el backend.
// El mes con más incidentes se marca en amarillo (ver chartTheme).

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList,
} from "recharts";
import {
  SERIE, MAXIMO, TOOLTIP, indiceMaximo, dotMaximo, useIdsGrafico, defsGrafico, urlDe,
} from "../chartTheme";

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// `etiqueta` nombra la unidad que se cuenta: el COMM cuenta incidentes, pero
// la Patrulla cuenta intervenciones y reusa este mismo gráfico.
export default function TrendLineChart({ data, etiqueta = "Incidentes" }) {
  const ids = useIdsGrafico();
  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el filtro actual.</div>;
  }
  const shaped = data.map((d) => ({ ...d, label: cap(d.name) }));
  const idxMax = indiceMaximo(shaped);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={shaped} margin={{ left: -18, right: 30, top: 24 }}>
        {defsGrafico(ids)}
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
        <XAxis dataKey="label" tick={{ fontSize: 13, fill: "var(--ink-3)" }} />
        <YAxis tick={{ fontSize: 13, fill: "var(--ink-3)" }} allowDecimals={false} />
        <Tooltip {...TOOLTIP} formatter={(v) => [v, etiqueta]} />
        <Area type="monotone" dataKey="value" name={etiqueta} stroke={SERIE}
          strokeWidth={2.5} fill={urlDe(ids.area)} isAnimationActive={false}
          dot={dotMaximo(idxMax, ids.brillo)}
          activeDot={{ r: 7, stroke: "var(--surface)", strokeWidth: 2 }}>
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
