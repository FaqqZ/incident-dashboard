// EvolucionApilada.jsx — cómo se reparte el total mes a mes.
//
// Complementa a la torta: la torta muestra la composición del período entero y
// esto muestra si esa composición se movió. Las áreas van apiladas, así que el
// borde de arriba es el total del mes y cada franja es lo que aportó cada
// categoría.
//
// Se apilan las de mayor volumen y el resto se junta en "Otras": con veintiuna
// franjas no se distinguiría ninguna. La lectura fina de una categoría sola
// sale de elegirla, que cambia el gráfico de evolución de arriba.

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { TOOLTIP, MAXIMO, useIdsGrafico, defsGrafico, urlDe } from "../chartTheme";

const nf = (v) => (v ?? 0).toLocaleString("es-AR");
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const PALETA = [
  "var(--c7)", "var(--c2)", "var(--c4)", "var(--c3)",
  "var(--c6)", "var(--c1)", "var(--c8)", "var(--c5)",
];
const OTRAS = "var(--ink-3)";

export default function EvolucionApilada({ series, tope = 6, seleccionado = "" }) {
  const ids = useIdsGrafico();

  if (!series || series.length === 0) {
    return <div className="state">Sin datos para el rango elegido.</div>;
  }

  // Si la categoría elegida quedó en la cola, se la saca de "Otras" y se dibuja
  // aparte: si no, elegirla no cambiaría nada en este gráfico.
  let visibles = series.slice(0, tope);
  if (seleccionado && !visibles.some((s) => s.tipo === seleccionado)) {
    const elegida = series.find((s) => s.tipo === seleccionado);
    if (elegida) visibles = [...visibles, elegida];
  }
  const cola = series.filter((s) => !visibles.includes(s));
  const claveOtras = cola.length ? `Otras (${cola.length})` : null;

  // Los meses salen de la primera serie: todas traen los mismos puntos.
  const meses = visibles[0].puntos.map((p) => p.name);
  const datos = meses.map((mes, i) => {
    const fila = { mes: cap(mes) };
    visibles.forEach((s) => { fila[s.tipo] = s.puntos[i]?.value || 0; });
    if (claveOtras) fila[claveOtras] = cola.reduce((acc, s) => acc + (s.puntos[i]?.value || 0), 0);
    return fila;
  });

  const capas = [
    ...visibles.map((s, i) => ({
      clave: s.tipo,
      color: i === 0 ? MAXIMO : PALETA[i % PALETA.length],
    })),
    ...(claveOtras ? [{ clave: claveOtras, color: OTRAS }] : []),
  ];

  return (
    <ResponsiveContainer width="100%" height={360}>
      <AreaChart data={datos} margin={{ left: -12, right: 16, top: 10 }}>
        {defsGrafico(ids, { colores: capas.map((c) => c.color) })}
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
        <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--ink-3)" }} />
        <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
        <Tooltip {...TOOLTIP} formatter={(v, n) => [nf(v), n]} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          iconType="circle"
          iconSize={9}
        />
        {/* Recharts apila en el orden en que se declaran las áreas, así que la
            categoría más grande queda abajo apoyada en el eje —es la más fácil
            de leer— y "Otras" arriba, que es la que menos importa seguir. */}
        {capas.map((c, i) => (
          <Area
            key={c.clave}
            type="monotone"
            dataKey={c.clave}
            stackId="total"
            stroke={c.color}
            strokeWidth={1.5}
            fill={urlDe(`${ids.capa}-${i}`)}
            // Con una categoría elegida, las demás franjas quedan atenuadas pero
            // siguen apiladas: se ve cuánto aporta la elegida al total del mes.
            fillOpacity={seleccionado && c.clave !== seleccionado ? 0.12 : 1}
            strokeOpacity={seleccionado && c.clave !== seleccionado ? 0.3 : 1}
            isAnimationActive={false}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 1.5 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
