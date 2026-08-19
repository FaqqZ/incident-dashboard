// chartTheme.jsx — paleta y reglas comunes de los gráficos.
//
// Regla del tablero: en todo gráfico que tenga un valor máximo, ese valor va en
// AMARILLO (--color-1) y el resto en azul. Vive acá para que sea una sola regla
// y no una decisión repetida en cada componente.
//
// No aplica a los mapas de recurrencia ni al gráfico de puntos priorizados: esos
// usan los colores que fija el instructivo del COMM (§5) según la clase, y ahí
// el color significa otra cosa.

export const SERIE = "var(--graf-serie)";
export const SERIE_2 = "var(--graf-serie-2)";
export const MAXIMO = "var(--graf-max)";

// Índice del valor más alto. Devuelve -1 si empatan todos o no hay datos: sin
// un máximo que se destaque, resaltar cualquiera sería arbitrario.
export function indiceMaximo(data, key = "value") {
  if (!data || data.length < 2) return -1;
  let idx = 0;
  for (let i = 1; i < data.length; i++) if (data[i][key] > data[idx][key]) idx = i;
  const max = data[idx][key];
  if (data.every((d) => d[key] === max)) return -1;
  return idx;
}

export function colorSegunMaximo(i, idxMax) {
  return i === idxMax ? MAXIMO : SERIE;
}

// Punto del gráfico de área: el máximo va más grande y en amarillo.
export function dotMaximo(idxMax) {
  return function Punto(props) {
    const { cx, cy, index, key } = props;
    if (cx === undefined || cy === undefined) return null;
    const esMax = index === idxMax;
    return (
      <circle
        key={key}
        cx={cx}
        cy={cy}
        r={esMax ? 6 : 4}
        fill={esMax ? MAXIMO : SERIE}
        stroke="var(--surface)"
        strokeWidth={2}
      />
    );
  };
}

// Estilo compartido de los tooltips, para que no se repita en cada gráfico.
export const TOOLTIP = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid var(--border)",
    fontSize: 13,
    background: "var(--surface-2)",
  },
  labelStyle: { color: "var(--ink-2)" },
  itemStyle: { color: "var(--ink)" },
};
