// EvolucionApilada.jsx — evolución mes a mes de las categorías de Defensa Civil.
//
// Un selector con TODAS las categorías (ordenadas por volumen) elige cuál se
// estudia: se ve su evolución mes a mes, con el valor de cada mes y el mes pico
// en amarillo. Arranca con la categoría principal del período, o con la elegida
// en los filtros del tablero.
//
// Antes eran botones solo para las seis más grandes más "Otras": una categoría
// chica no se podía mirar sola. El selector las ofrece a todas.
//
// La última opción, "Todas, apiladas", muestra la composición del total: las
// seis principales y el resto agrupado en "Otras" (con veintiuna franjas no se
// distinguiría ninguna).

import { useEffect, useId, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Legend,
} from "recharts";
import {
  SERIE, MAXIMO, TOOLTIP, indiceMaximo, dotMaximo, useIdsGrafico, defsGrafico, urlDe,
} from "../chartTheme";

const nf = (v, d = 0) =>
  (v ?? 0).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const PALETA = [
  "var(--c7)", "var(--c2)", "var(--c4)", "var(--c3)",
  "var(--c6)", "var(--c1)", "var(--c8)", "var(--c5)",
];
const OTRAS = "var(--ink-3)";
const TODAS = "__todas";

export default function EvolucionApilada({ series, tope = 6, seleccionado = "" }) {
  const ids = useIdsGrafico();
  const idSelect = useId();
  const principal = series?.[0]?.tipo || "";
  const inicial = seleccionado || principal;
  const [elegida, setElegida] = useState(inicial);

  // Cambió la categoría elegida en los filtros, o el período movió cuál es la
  // principal: se vuelve a arrancar desde esa.
  useEffect(() => {
    setElegida(inicial);
  }, [inicial]);

  if (!series || series.length === 0) {
    return <div className="state">Sin datos para el rango elegido.</div>;
  }

  const meses = series[0].puntos.map((p) => p.name);
  // Total de TODAS las categorías en cada mes, para decir qué parte del mes
  // se llevó la categoría que se está mirando.
  const totalMes = meses.map((_, i) => series.reduce((acc, s) => acc + (s.puntos[i]?.value || 0), 0));
  const totalPeriodo = totalMes.reduce((a, b) => a + b, 0);

  const vistaTodas = elegida === TODAS;
  // Si la categoría guardada ya no está en el período, se vuelve a la principal.
  const serie = vistaTodas ? null : series.find((s) => s.tipo === elegida) || series[0];

  const selector = (
    <div className="field evol-campo">
      <label htmlFor={idSelect}>Categoría a estudiar</label>
      <select
        id={idSelect}
        value={vistaTodas ? TODAS : serie.tipo}
        onChange={(e) => setElegida(e.target.value)}
      >
        {series.map((s, i) => (
          <option key={s.tipo} value={s.tipo}>
            {s.tipo} · {nf(s.total)}{i === 0 ? " (principal)" : ""}
          </option>
        ))}
        <option value={TODAS}>Todas, apiladas (composición del total)</option>
      </select>
    </div>
  );

  // --- Una categoría -------------------------------------------------------
  if (!vistaTodas) {
    const datos = meses.map((mes, i) => ({ mes: cap(mes), value: serie.puntos[i]?.value || 0 }));
    const idxMax = indiceMaximo(datos);
    const pico = idxMax >= 0
      ? {
          mes: datos[idxMax].mes,
          valor: datos[idxMax].value,
          pctDelMes: totalMes[idxMax] ? (datos[idxMax].value / totalMes[idxMax]) * 100 : 0,
        }
      : null;

    return (
      <>
        {selector}

        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={datos} margin={{ left: -12, right: 24, top: 28 }}>
            {defsGrafico(ids)}
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--ink-3)" }} />
            <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
            <Tooltip {...TOOLTIP} formatter={(v) => [nf(v), serie.tipo]} />
            <Area
              type="monotone"
              dataKey="value"
              name={serie.tipo}
              stroke={SERIE}
              strokeWidth={2.5}
              fill={urlDe(ids.area)}
              isAnimationActive={false}
              dot={dotMaximo(idxMax, ids.brillo)}
              activeDot={{ r: 6, stroke: "var(--surface)", strokeWidth: 2 }}
            >
              <LabelList
                dataKey="value"
                position="top"
                content={({ x, y, value, index }) => (
                  <text
                    x={x}
                    y={y}
                    dy={-12}
                    textAnchor="middle"
                    fill={index === idxMax ? MAXIMO : "var(--ink)"}
                    fontSize={index === idxMax ? 13 : 12}
                    fontWeight={index === idxMax ? 700 : 600}
                  >
                    {nf(value)}
                  </text>
                )}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>

        <p className="evol-resumen">
          <b>{serie.tipo}</b>: {nf(serie.total)} denuncias, el{" "}
          {nf(totalPeriodo ? (serie.total / totalPeriodo) * 100 : 0, 1)}% del período.{" "}
          {pico ? (
            <>
              Mes pico: <b style={{ color: MAXIMO }}>{pico.mes}</b>, con {nf(pico.valor)} —
              el {nf(pico.pctDelMes, 1)}% de todas las denuncias de ese mes.
            </>
          ) : (
            "No tiene un mes que se destaque sobre los demás."
          )}
        </p>
      </>
    );
  }

  // --- Todas, apiladas ------------------------------------------------------
  const visibles = series.slice(0, tope);
  const cola = series.slice(tope);
  // dataKey por posición y no por nombre: Recharts lee el dataKey como una ruta
  // con puntos, y hay etiquetas como "Sin señalizar." que la romperían.
  const capas = [
    ...visibles.map((s, i) => ({
      dk: `s${i}`,
      nombre: s.tipo,
      color: i === 0 ? MAXIMO : PALETA[i % PALETA.length],
      valores: s.puntos.map((p) => p.value || 0),
    })),
    ...(cola.length
      ? [{
          dk: "otras",
          nombre: `Otras (${cola.length})`,
          color: OTRAS,
          valores: meses.map((_, i) => cola.reduce((acc, s) => acc + (s.puntos[i]?.value || 0), 0)),
        }]
      : []),
  ];
  const datos = meses.map((mes, i) => {
    const fila = { mes: cap(mes) };
    capas.forEach((c) => { fila[c.dk] = c.valores[i]; });
    return fila;
  });

  return (
    <>
      {selector}

      <ResponsiveContainer width="100%" height={360}>
        <AreaChart data={datos} margin={{ left: -12, right: 16, top: 10 }}>
          {defsGrafico(ids, { colores: capas.map((c) => c.color) })}
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
          <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--ink-3)" }} />
          <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
          <Tooltip {...TOOLTIP} formatter={(v, n) => [nf(v), n]} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={9} />
          {/* Recharts apila en el orden en que se declaran: la categoría más
              grande abajo, apoyada en el eje, y "Otras" arriba. */}
          {capas.map((c, i) => (
            <Area
              key={c.dk}
              type="monotone"
              dataKey={c.dk}
              name={c.nombre}
              stackId="total"
              stroke={c.color}
              strokeWidth={1.5}
              fill={urlDe(`${ids.capa}-${i}`)}
              isAnimationActive={false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 1.5 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      <p className="evol-resumen">
        Las {visibles.length} categorías principales{cola.length ? ` y ${cola.length} más agrupadas en “Otras”` : ""}.
        El borde de arriba es el total de denuncias de cada mes y cada franja, lo que aportó cada
        categoría.
      </p>
    </>
  );
}
