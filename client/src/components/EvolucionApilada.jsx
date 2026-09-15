// EvolucionApilada.jsx — evolución mes a mes de las categorías de Defensa Civil.
//
// Arranca mostrando SOLO la categoría principal del período (o la elegida en el
// filtro): su evolución mes a mes, con el valor de cada mes y el mes pico en
// amarillo. Con las seis categorías apiladas de entrada no se podía seguir
// ninguna: la franja de cada una quedaba montada sobre las otras y su pico no
// se leía.
//
// Tocando otras categorías se suman al gráfico, apiladas: ahí el borde de
// arriba es el total de las activas y cada franja es lo que aportó cada una.
// Siempre queda al menos una activa.
//
// Se ofrecen las de mayor volumen y el resto se junta en "Otras": con veintiuna
// no se distinguiría ninguna.

import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList,
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
const CLAVE_OTRAS = "__otras";

export default function EvolucionApilada({ series, tope = 6, seleccionado = "" }) {
  const ids = useIdsGrafico();
  const principal = series?.[0]?.tipo || "";
  const inicial = seleccionado || principal;
  const [activas, setActivas] = useState(() => (inicial ? [inicial] : []));

  // Cambió la categoría elegida en el filtro, o el período movió cuál es la
  // principal: se vuelve a arrancar desde esa.
  useEffect(() => {
    setActivas(inicial ? [inicial] : []);
  }, [inicial]);

  if (!series || series.length === 0) {
    return <div className="state">Sin datos para el rango elegido.</div>;
  }

  // Si la categoría elegida quedó fuera de las principales, se la ofrece igual:
  // si no, elegirla en el filtro no cambiaría nada en este gráfico.
  let visibles = series.slice(0, tope);
  if (seleccionado && !visibles.some((s) => s.tipo === seleccionado)) {
    const elegida = series.find((s) => s.tipo === seleccionado);
    if (elegida) visibles = [...visibles, elegida];
  }
  const cola = series.filter((s) => !visibles.includes(s));

  const meses = series[0].puntos.map((p) => p.name);
  // Total de TODAS las categorías en cada mes, para decir qué parte del mes
  // se llevó la categoría que se está mirando.
  const totalMes = meses.map((_, i) => series.reduce((acc, s) => acc + (s.puntos[i]?.value || 0), 0));
  const totalPeriodo = totalMes.reduce((a, b) => a + b, 0);

  // dataKey por posición y no por nombre: Recharts lee el dataKey como una ruta
  // con puntos, y hay etiquetas como "Sin señalizar." que la romperían.
  const capas = [
    ...visibles.map((s, i) => ({
      clave: s.tipo,
      dk: `s${i}`,
      nombre: s.tipo,
      total: s.total,
      color: i === 0 ? MAXIMO : PALETA[i % PALETA.length],
      valores: s.puntos.map((p) => p.value || 0),
    })),
    ...(cola.length
      ? [{
          clave: CLAVE_OTRAS,
          dk: "otras",
          nombre: `Otras (${cola.length})`,
          total: cola.reduce((acc, s) => acc + s.total, 0),
          color: OTRAS,
          valores: meses.map((_, i) => cola.reduce((acc, s) => acc + (s.puntos[i]?.value || 0), 0)),
        }]
      : []),
  ];

  const existe = (clave) => capas.some((c) => c.clave === clave);
  const enUso = activas.filter(existe).length ? activas.filter(existe) : [capas[0].clave];
  const capasActivas = capas.filter((c) => enUso.includes(c.clave));
  const sola = capasActivas.length === 1 ? capasActivas[0] : null;

  const datos = meses.map((mes, i) => {
    const fila = { mes: cap(mes), value: sola ? sola.valores[i] : 0 };
    capasActivas.forEach((c) => { fila[c.dk] = c.valores[i]; });
    return fila;
  });

  const alternar = (clave) =>
    setActivas((prev) => {
      const actuales = prev.filter(existe).length ? prev.filter(existe) : [capas[0].clave];
      if (!actuales.includes(clave)) return [...actuales, clave];
      // La última activa no se apaga: un gráfico vacío no dice nada.
      return actuales.length === 1 ? actuales : actuales.filter((c) => c !== clave);
    });

  const reiniciar = () => setActivas([existe(inicial) ? inicial : capas[0].clave]);

  const idxMax = sola ? indiceMaximo(datos) : -1;
  const pico = idxMax >= 0
    ? {
        mes: datos[idxMax].mes,
        valor: datos[idxMax].value,
        pctDelMes: totalMes[idxMax] ? (datos[idxMax].value / totalMes[idxMax]) * 100 : 0,
      }
    : null;
  const sumaActivas = capasActivas.reduce((acc, c) => acc + c.total, 0);

  return (
    <>
      <div className="evol-chips" role="group" aria-label="Categorías que muestra el gráfico">
        {capas.map((c) => {
          const activa = enUso.includes(c.clave);
          // Con una sola activa el área va en azul (el amarillo queda para su
          // mes pico): el punto del botón acompaña ese color.
          const punto = sola && sola.clave === c.clave ? SERIE : c.color;
          return (
            <button
              key={c.clave}
              type="button"
              className={`evol-chip${activa ? " activa" : ""}`}
              aria-pressed={activa}
              onClick={() => alternar(c.clave)}
              title={activa && enUso.length === 1 ? "Tiene que quedar al menos una categoría" : undefined}
            >
              <i style={{ background: punto }} />
              <span>{c.nombre}</span>
              <b>{nf(c.total)}</b>
            </button>
          );
        })}
        {enUso.length > 1 ? (
          <button type="button" className="evol-accion" onClick={reiniciar}>
            {seleccionado ? "Solo la elegida" : "Solo la principal"}
          </button>
        ) : (
          <button type="button" className="evol-accion" onClick={() => setActivas(capas.map((c) => c.clave))}>
            Sumar todas
          </button>
        )}
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <AreaChart data={datos} margin={{ left: -12, right: 24, top: sola ? 28 : 10 }}>
          {defsGrafico(ids, { colores: capasActivas.map((c) => c.color) })}
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
          <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--ink-3)" }} />
          <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
          <Tooltip {...TOOLTIP} formatter={(v, n) => [nf(v), n]} />
          {sola ? (
            <Area
              key={sola.clave}
              type="monotone"
              dataKey="value"
              name={sola.nombre}
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
          ) : (
            // Recharts apila en el orden en que se declaran: la categoría más
            // grande abajo, apoyada en el eje, y "Otras" arriba.
            capasActivas.map((c, i) => (
              <Area
                key={c.clave}
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
            ))
          )}
        </AreaChart>
      </ResponsiveContainer>

      <p className="evol-resumen">
        {sola ? (
          pico ? (
            <>
              Mes pico de <b>{sola.nombre}</b>:{" "}
              <b style={{ color: MAXIMO }}>{pico.mes}</b>, con {nf(pico.valor)} denuncias —
              el {nf(pico.pctDelMes, 1)}% de todas las denuncias de ese mes.
            </>
          ) : (
            <>
              <b>{sola.nombre}</b> no tiene un mes que se destaque sobre los demás.
            </>
          )
        ) : (
          <>
            {capasActivas.length} categorías activas: suman {nf(sumaActivas)} denuncias, el{" "}
            {nf(totalPeriodo ? (sumaActivas / totalPeriodo) * 100 : 0, 1)}% del período. El borde de
            arriba es el total de las activas y cada franja, lo que aportó cada una.
          </>
        )}
      </p>
    </>
  );
}
