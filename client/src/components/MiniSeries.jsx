// MiniSeries.jsx — evolución mensual de CADA serie de un desglose.
//
// Por qué no un apilado: Prevención (3.916) y Derrumbe (7) se llevan tres
// órdenes de magnitud de diferencia. En un gráfico apilado o de líneas con eje
// compartido, los siete tipos chicos quedan pegados al cero y no se les ve
// ninguna variación. Acá cada tipo tiene su propia escala, así que se compara
// la FORMA de cada serie —si sube, si baja, si tiene un pico— y no su altura.

import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import {
  SERIE, MAXIMO, TOOLTIP, indiceMaximo, dotMaximo, useIdsGrafico, defsGrafico, urlDe,
} from "../chartTheme";

const nf = (v) => (v ?? 0).toLocaleString("es-AR");
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function Mini({ serie, seleccionado, onSelect }) {
  const ids = useIdsGrafico();
  const puntos = serie.puntos.map((p) => ({ ...p, label: cap(p.name) }));
  const idxMax = indiceMaximo(puntos);
  const activo = !seleccionado || seleccionado === serie.tipo;
  const pico = idxMax >= 0 ? puntos[idxMax] : null;

  return (
    <button
      type="button"
      className={`mini${activo ? "" : " apagado"}`}
      onClick={() => onSelect(serie.tipo)}
      aria-pressed={seleccionado === serie.tipo}
    >
      <div className="mini-head">
        <span className="mini-tipo">{serie.tipo}</span>
        <span className="mini-total">{nf(serie.total)}</span>
      </div>

      <ResponsiveContainer width="100%" height={72}>
        <AreaChart data={puntos} margin={{ top: 6, right: 6, bottom: 2, left: 6 }}>
          {defsGrafico(ids)}
          {/* Cada tipo con su propia escala: ese es el punto de esta vista.
              El piso en 0 evita que una serie plana parezca una montaña. */}
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            {...TOOLTIP}
            labelFormatter={(l) => l}
            formatter={(v) => [nf(v), serie.tipo]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={SERIE}
            strokeWidth={2}
            fill={urlDe(ids.area)}
            isAnimationActive={false}
            dot={dotMaximo(idxMax, ids.brillo)}
            activeDot={{ r: 5, stroke: "var(--surface-2)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="mini-pie">
        {pico ? (
          <>
            Pico en <b style={{ color: MAXIMO }}>{cap(pico.name)}</b> · {nf(pico.value)}
          </>
        ) : (
          "Sin variación entre meses"
        )}
      </div>
    </button>
  );
}

export default function MiniSeries({ series, seleccionado, onSelect }) {
  if (!series || series.length === 0) {
    return <div className="state">Sin datos para el rango elegido.</div>;
  }
  return (
    <div className="minis">
      {series.map((s) => (
        <Mini key={s.tipo} serie={s} seleccionado={seleccionado} onSelect={onSelect} />
      ))}
    </div>
  );
}
