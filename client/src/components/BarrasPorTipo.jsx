// BarrasPorTipo.jsx — barras horizontales de un desglose, con selección.
// Click en una barra = elige ese valor (toggle). Lo comparten la Patrulla y
// Defensa Civil, que tienen bases distintas pero el mismo tipo de corte.
//
// A diferencia del gráfico de categorías del COMM, este NO se recorta cuando
// hay un valor elegido: el backend manda siempre la lista completa y acá se
// atenúan los no seleccionados. Con una sola barra en pantalla no habría
// forma de cambiar de valor desde el propio gráfico.

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LabelList,
} from "recharts";
import { useNarrowScreen } from "../hooks/useNarrowScreen";
import {
  TOOLTIP, indiceMaximo, rellenoBarra, useIdsGrafico, defsGrafico, urlDe,
} from "../chartTheme";

const nf = (v) => (v ?? 0).toLocaleString("es-AR");

// Recharts parte las etiquetas largas en varias líneas y el eje se come el
// gráfico. Se recortan acá; el nombre completo sigue estando en el tooltip.
const recortar = (v) => (v?.length > 34 ? `${v.slice(0, 33)}…` : v);

export default function BarrasPorTipo({
  data, seleccionado, onSelect, etiqueta = "Intervenciones", tope = 0,
}) {
  const narrow = useNarrowScreen();
  const ids = useIdsGrafico();

  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el rango elegido.</div>;
  }

  // Con tope, la cola larga se resume en una línea debajo en vez de dibujar
  // barras de un caso que no se leen.
  const visibles = tope > 0 ? data.slice(0, tope) : data;
  const ocultas = data.length - visibles.length;
  const enCola = data.slice(visibles.length).reduce((acc, d) => acc + d.value, 0);

  const idxMax = indiceMaximo(visibles);
  const height = Math.min(620, Math.max(320, visibles.length * 46));

  return (
    <>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={visibles} layout="vertical" margin={{ left: 8, right: 64 }}>
        {defsGrafico(ids, { horizontal: true })}
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 5" />
        <XAxis type="number" tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={narrow ? 120 : 210}
          interval={0}
          tickFormatter={recortar}
          tick={{ fontSize: narrow || visibles.length > 14 ? 11 : 13, fill: "var(--ink-2)" }}
        />
        <Tooltip
          cursor={{ fill: "var(--brand-050)" }}
          {...TOOLTIP}
          formatter={(v) => [nf(v), etiqueta]}
        />
        <Bar
          dataKey="value"
          radius={[0, 6, 6, 0]}
          maxBarSize={34}
          isAnimationActive={false}
          cursor="pointer"
          onClick={(d) => onSelect(d.name)}
        >
          <LabelList dataKey="value" position="right" offset={8}
            formatter={nf} style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }} />
          {visibles.map((entry, i) => {
            const activa = !seleccionado || seleccionado === entry.name;
            return (
              <Cell
                key={entry.name}
                fill={rellenoBarra(ids, i, idxMax)}
                fillOpacity={activa ? 1 : 0.26}
                filter={i === idxMax && activa ? urlDe(ids.brillo) : undefined}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>

    {ocultas > 0 && (
      <p className="panel-sub" style={{ margin: "10px 0 0" }}>
        Se muestran los {visibles.length} de mayor volumen. Quedan {nf(ocultas)} más,
        que suman {nf(enCola)}.
      </p>
    )}
    </>
  );
}
