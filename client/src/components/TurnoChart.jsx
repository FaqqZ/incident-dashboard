// TurnoChart.jsx — distribución por turno (dona). Click en un sector filtra todo.
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useFilters } from "../store/useFilters";

const PALETTE = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

export default function TurnoChart({ data }) {
  const { filters, toggleFilter } = useFilters();
  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el filtro actual.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92}
          paddingAngle={2} cursor="pointer" onClick={(d) => toggleFilter("turno", d.name)}>
          {data.map((entry, i) => {
            const active = !filters.turno || filters.turno === entry.name;
            return (
              <Cell key={entry.name} fill={PALETTE[i % PALETTE.length]}
                fillOpacity={active ? 1 : 0.28} stroke="var(--surface)" strokeWidth={2} />
            );
          })}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 13,
          background: "var(--surface-2)" }}
          labelStyle={{ color: "var(--ink-2)" }} itemStyle={{ color: "var(--ink)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
}
