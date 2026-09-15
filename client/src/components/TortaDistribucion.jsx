// TortaDistribucion.jsx — composición de un total, en anillo.
//
// Defensa Civil lo usa en vez de las barras de la Patrulla: acá interesa qué
// PARTE del total se lleva cada categoría, no rankearlas una contra otra.
//
// Con 21 categorías una torta es ilegible, así que se grafican las de mayor
// volumen y el resto se junta en una porción "Otras". Esa porción NO es
// clickeable: agrupa cosas distintas y filtrar por ella no significaría nada.
//
// El máximo va en amarillo, como en todos los gráficos del tablero.

import { useState } from "react";
import { PieChart, Pie, Cell, Sector, Tooltip, ResponsiveContainer } from "recharts";
import { TOOLTIP, MAXIMO, useIdsGrafico, defsGrafico, urlDe } from "../chartTheme";

const nf = (v) => (v ?? 0).toLocaleString("es-AR");
const pct = (v, total) => (total ? (v / total) * 100 : 0);

// Secuencia categórica del tema, ya calibrada para el fondo oscuro. El primer
// lugar lo ocupa el amarillo del máximo, así que arranca en la segunda.
const PALETA = [
  "var(--c7)", "var(--c2)", "var(--c4)", "var(--c3)",
  "var(--c6)", "var(--c1)", "var(--c8)", "var(--c5)",
];
const OTRAS = "var(--ink-3)";

export default function TortaDistribucion({
  data, seleccionado, onSelect, tope = 8, etiqueta = "Registros",
}) {
  const ids = useIdsGrafico();
  // Porción bajo el cursor: se agranda un poco para confirmar qué se está
  // señalando. Es el único movimiento del gráfico y responde al mouse, así que
  // no compite con la lectura.
  const [activa, setActiva] = useState(-1);

  if (!data || data.length === 0) {
    return <div className="state">Sin datos para el rango elegido.</div>;
  }

  const total = data.reduce((acc, d) => acc + d.value, 0);
  const visibles = data.slice(0, tope);
  const cola = data.slice(tope);
  const enCola = cola.reduce((acc, d) => acc + d.value, 0);

  const porciones = [
    ...visibles.map((d, i) => ({ ...d, color: i === 0 ? MAXIMO : PALETA[i % PALETA.length] })),
    ...(cola.length
      ? [{ name: `Otras (${cola.length})`, value: enCola, color: OTRAS, agrupada: true }]
      : []),
  ];

  // Con una porción elegida, el centro del anillo muestra ESA y no el total:
  // es el número que se está mirando.
  const elegida = seleccionado ? data.find((d) => d.name === seleccionado) : null;

  return (
    <div className="torta">
      <div className="torta-grafico">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            {defsGrafico(ids, { colores: porciones.map((p) => p.color) })}
            <Pie
              data={porciones}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={72}
              outerRadius={118}
              paddingAngle={1.5}
              isAnimationActive={false}
              activeIndex={activa}
              activeShape={(props) => (
                <g>
                  <Sector {...props} outerRadius={props.outerRadius + 7} />
                  {/* Arco fino por fuera: refuerza cuál está señalada sin
                      depender solo del cambio de tamaño. */}
                  <Sector
                    {...props}
                    innerRadius={props.outerRadius + 10}
                    outerRadius={props.outerRadius + 12}
                    fillOpacity={0.65}
                  />
                </g>
              )}
              onMouseEnter={(_, i) => setActiva(i)}
              onMouseLeave={() => setActiva(-1)}
              onClick={(d) => !d.payload?.agrupada && onSelect(d.name)}
            >
              {porciones.map((p, i) => {
                const encendida = !seleccionado || seleccionado === p.name;
                return (
                  <Cell
                    key={p.name}
                    fill={urlDe(`${ids.capa}-${i}`)}
                    fillOpacity={encendida ? 1 : 0.22}
                    stroke="var(--surface)"
                    strokeWidth={2}
                    cursor={p.agrupada ? "default" : "pointer"}
                  />
                );
              })}
            </Pie>
            <Tooltip
              {...TOOLTIP}
              formatter={(v, n) => [`${nf(v)} (${pct(v, total).toFixed(1)}%)`, n]}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="torta-centro">
          <span className="torta-centro-valor">{nf(elegida ? elegida.value : total)}</span>
          <span className="torta-centro-label">
            {elegida ? `${pct(elegida.value, total).toFixed(1)}% del total` : etiqueta}
          </span>
        </div>
      </div>

      <ul className="torta-leyenda">
        {porciones.map((p) => {
          const encendida = !seleccionado || seleccionado === p.name;
          const contenido = (
            <>
              <i className="torta-punto" style={{ background: p.color }} />
              <span className="torta-nombre">{p.name}</span>
              <span className="torta-valor">{nf(p.value)}</span>
              <span className="torta-pct">{pct(p.value, total).toFixed(1)}%</span>
            </>
          );
          return (
            <li key={p.name} className={encendida ? "" : "apagada"}>
              {p.agrupada ? (
                <span className="torta-fila">{contenido}</span>
              ) : (
                <button type="button" className="torta-fila" onClick={() => onSelect(p.name)}>
                  {contenido}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
