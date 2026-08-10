// TrendLineChart.jsx — evolución mensual. Recibe [{name:"enero", mesnro, value}]
// ya ordenado por número de mes desde el backend.

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function TrendLineChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el filtro actual.</div>;
  }
  const shaped = data.map((d) => ({ ...d, label: cap(d.name) }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={shaped} margin={{ left: -18, right: 12, top: 8 }}>
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
        <Area type="monotone" dataKey="value" name="Incidentes" stroke="var(--brand)"
          strokeWidth={2.5} fill="url(#fillBrand)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
