// chartTheme.jsx — paleta y reglas comunes de los gráficos.
//
// Regla del tablero: en todo gráfico que tenga un valor máximo, ese valor va en
// AMARILLO (--color-1) y el resto en azul. Vive acá para que sea una sola regla
// y no una decisión repetida en cada componente.
//
// No aplica a los mapas de recurrencia ni al gráfico de puntos priorizados: esos
// usan los colores que fija el instructivo del COMM (§5) según la clase, y ahí
// el color significa otra cosa.

import { useId } from "react";

export const SERIE = "var(--graf-serie)";
export const SERIE_2 = "var(--graf-serie-2)";
export const MAXIMO = "var(--graf-max)";

// Los filtros SVG (feDropShadow) no resuelven var() de forma pareja entre
// navegadores, y html2canvas —que arma el PDF— tampoco. El amarillo del máximo
// va literal solo ahí; el resto del tablero sigue usando los tokens.
// Tiene que seguir a --color-1 de theme.css.
export const MAXIMO_HEX = "#f4dc00";

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

// Punto del gráfico de área: el máximo va más grande, en amarillo y con halo.
// `idBrillo` es opcional para no romper a quien lo llame sin <defs>.
export function dotMaximo(idxMax, idBrillo) {
  return function Punto(props) {
    const { cx, cy, index, key } = props;
    if (cx === undefined || cy === undefined) return null;
    const esMax = index === idxMax;
    return (
      <g key={key} filter={esMax && idBrillo ? urlDe(idBrillo) : undefined}>
        {/* Anillo tenue alrededor del máximo: le da cuerpo al punto sin
            depender solo del filtro, que en el PDF puede no rasterizarse. */}
        {esMax && (
          <circle cx={cx} cy={cy} r={10} fill={MAXIMO} fillOpacity={0.16} />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={esMax ? 6 : 4}
          fill={esMax ? MAXIMO : SERIE}
          stroke="var(--surface)"
          strokeWidth={2}
        />
      </g>
    );
  };
}

// --- Degradés y brillos ---------------------------------------------------
//
// Los rellenos planos se veían chatos sobre el navy. Cada gráfico pide sus
// propias definiciones SVG con `useIdsGrafico`, porque los id de <defs> son
// globales al documento: si dos gráficos usaran el mismo, el segundo tomaría
// el degradé del primero y bastaría con desmontar uno para que el otro se
// quedara sin relleno.

export function useIdsGrafico() {
  // useId trae ":" y eso no es válido dentro de un url(#…).
  const base = useId().replace(/[^a-zA-Z0-9]/g, "");
  return {
    area: `g-area-${base}`,
    areaMax: `g-areamax-${base}`,
    barra: `g-barra-${base}`,
    barraMax: `g-barramax-${base}`,
    brillo: `f-brillo-${base}`,
    capa: `g-capa-${base}`,
  };
}

export const urlDe = (id) => `url(#${id})`;

// Relleno de una barra según sea o no el máximo. Reemplaza a colorSegunMaximo
// donde hay degradé: la regla es la misma, cambia el relleno.
export function rellenoBarra(ids, i, idxMax) {
  return urlDe(i === idxMax ? ids.barraMax : ids.barra);
}

// OJO: NO es un componente y no se usa como <DefsGrafico />. Recharts filtra
// los hijos de un gráfico por tipo y descarta los que son componentes propios;
// un <defs> suelto, en cambio, lo deja pasar. Por eso esto se INVOCA
// —{defsGrafico(ids)}— para que Recharts reciba el elemento directo.
export function defsGrafico(ids, { colores = [], horizontal = false } = {}) {
  return (
    <defs key="defs-grafico">
      {/* Área: el degradé baja hasta casi transparente para que la línea
          quede como el borde de una masa y no como una franja recortada. */}
      <linearGradient id={ids.area} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={SERIE} stopOpacity={0.42} />
        <stop offset="100%" stopColor={SERIE} stopOpacity={0.015} />
      </linearGradient>
      <linearGradient id={ids.areaMax} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={MAXIMO} stopOpacity={0.38} />
        <stop offset="100%" stopColor={MAXIMO} stopOpacity={0.015} />
      </linearGradient>

      {/* Barras: el degradé corre a lo largo de la barra, así que cambia de
          eje según sea horizontal o vertical. */}
      <linearGradient
        id={ids.barra}
        x1="0" y1="0"
        x2={horizontal ? "1" : "0"} y2={horizontal ? "0" : "1"}
      >
        <stop offset="0%" stopColor={SERIE} stopOpacity={horizontal ? 0.68 : 1} />
        <stop offset="100%" stopColor={SERIE} stopOpacity={horizontal ? 1 : 0.68} />
      </linearGradient>
      <linearGradient
        id={ids.barraMax}
        x1="0" y1="0"
        x2={horizontal ? "1" : "0"} y2={horizontal ? "0" : "1"}
      >
        <stop offset="0%" stopColor={MAXIMO} stopOpacity={horizontal ? 0.62 : 1} />
        <stop offset="100%" stopColor={MAXIMO} stopOpacity={horizontal ? 1 : 0.62} />
      </linearGradient>

      {/* El máximo ya va en amarillo; el halo lo despega del fondo para que se
          encuentre de un vistazo sin agregar otro color a la lectura. */}
      <filter id={ids.brillo} x="-45%" y="-45%" width="190%" height="190%">
        <feDropShadow dx="0" dy="0" stdDeviation="4.5"
          floodColor={MAXIMO_HEX} floodOpacity="0.5" />
      </filter>

      {/* Una capa por color, para las áreas apiladas y las porciones. */}
      {colores.map((c, i) => (
        <linearGradient key={i} id={`${ids.capa}-${i}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity={0.95} />
          <stop offset="100%" stopColor={c} stopOpacity={0.55} />
        </linearGradient>
      ))}
    </defs>
  );
}

// Estilo compartido de los tooltips, para que no se repita en cada gráfico.
export const TOOLTIP = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid var(--surface-3)",
    fontSize: 13,
    background: "var(--surface-2)",
    boxShadow: "0 8px 28px rgba(0, 0, 0, 0.45)",
    padding: "10px 13px",
  },
  labelStyle: { color: "var(--ink-2)", fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: "var(--ink)", padding: "2px 0" },
  // Sin el desfase, el globo queda pegado al cursor y tapa el dato señalado.
  offset: 14,
  animationDuration: 140,
};
