// TrendLineChart.jsx — evolución mensual. Recibe [{name:"enero", mesnro, value}]
// ya ordenado por número de mes desde el backend.

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList,
} from "recharts";

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const nf = (v) => (v ?? 0).toLocaleString("es-AR");

export default function TrendLineChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el filtro actual.</div>;
  }
  const shaped = data.map((d) => ({ ...d, label: cap(d.name) }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      {/* top y right holgados: las etiquetas de valor van encima de cada punto */}
      <AreaChart data={shaped} margin={{ left: -18, right: 24, top: 30 }}>
        <defs>
          <linearGradient id="fillBrand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-3)" }} />
        <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 13,
          background: "var(--surface-2)" }}
          labelStyle={{ color: "var(--ink-2)" }} itemStyle={{ color: "var(--ink)" }}
          formatter={(v) => [v, "Incidentes"]} />
        {/* Puntos y valores siempre visibles: el dato de cada mes se lee sin
            tener que pasar el mouse por encima. */}
        {/* isAnimationActive={false}: con la animación puesta, Recharts vuelve a
            dibujar las etiquetas recién al terminar y al cambiar de filtro
            desaparecían. Sin animación quedan siempre visibles. */}
        <Area type="monotone" dataKey="value" name="Incidentes" stroke="var(--brand)"
          strokeWidth={2.5} fill="url(#fillBrand)" isAnimationActive={false}
          dot={{ r: 4, fill: "var(--brand)", stroke: "var(--surface)", strokeWidth: 2 }}
          activeDot={{ r: 6 }}>
          <LabelList dataKey="value" position="top" offset={12}
            formatter={nf} style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }} />
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  );
}
