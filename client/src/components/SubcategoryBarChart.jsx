// SubcategoryBarChart.jsx — desglose por subcategoría.
// Click en una barra = filtra todo el tablero por esa subcategoría (toggle).
//
// Es el corte que abre las categorías grandes: "TRÁNSITO." concentra la mayor
// parte de los reportes y sin este desglose se lee como un bloque único.

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LabelList,
} from "recharts";
import { useFilters } from "../store/useFilters";
import { useNarrowScreen } from "../hooks/useNarrowScreen";
import { TOOLTIP, indiceMaximo, colorSegunMaximo } from "../chartTheme";

const nf = (v) => (v ?? 0).toLocaleString("es-AR");

// Tope de barras visibles: hay categorías con muchas subcategorías y la cola
// larga no aporta. El resto se resume en una línea debajo del gráfico.
const TOPE = 15;

export default function SubcategoryBarChart({ data }) {
  const { filters, toggleFilter } = useFilters();
  const narrow = useNarrowScreen();

  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el filtro actual.</div>;
  }

  const visibles = data.slice(0, TOPE);
  const ocultas = data.length - visibles.length;
  const enCola = data.slice(TOPE).reduce((acc, d) => acc + d.value, 0);
  const idxMax = indiceMaximo(visibles);
  const height = Math.min(700, Math.max(300, visibles.length * 42));

  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={visibles} layout="vertical" margin={{ left: 8, right: 64 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={narrow ? 130 : 260}
            interval={0}
            tickFormatter={(v) => (v?.length > 34 ? `${v.slice(0, 33)}…` : v)}
            tick={{ fontSize: narrow ? 10 : 12, fill: "var(--ink-2)" }}
          />
          <Tooltip cursor={{ fill: "var(--brand-050)" }} {...TOOLTIP} />
          <Bar
            dataKey="value"
            radius={[0, 6, 6, 0]}
            maxBarSize={28}
            isAnimationActive={false}
            cursor="pointer"
            onClick={(d) => toggleFilter("subcategoria", d.name)}
          >
            <LabelList dataKey="value" position="right" offset={8}
              formatter={nf} style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }} />
            {visibles.map((entry, i) => {
              const activa = !filters.subcategoria || filters.subcategoria === entry.name;
              return (
                <Cell
                  key={entry.name}
                  fill={colorSegunMaximo(i, idxMax)}
                  fillOpacity={activa ? 1 : 0.28}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {ocultas > 0 && (
        <p className="panel-sub" style={{ margin: "10px 0 0" }}>
          Se muestran las {TOPE} más frecuentes. Quedan {nf(ocultas)} subcategorías más,
          que suman {nf(enCola)} registros.
        </p>
      )}
    </>
  );
}
