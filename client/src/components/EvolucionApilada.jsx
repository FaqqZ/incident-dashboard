// EvolucionApilada.jsx — evolución y participación de las categorías de
// Defensa Civil, mes a mes.
//
// Controles propios del gráfico (no tocan los filtros del tablero):
//   · Categoría: cualquiera de las 21, o "Todas, apiladas".
//   · Período: desde / hasta, dentro de los meses que trae la vista.
//   · Cantidad / % del mes: denuncias absolutas o participación sobre el total
//     de denuncias de cada mes.
//
// La participación se calcula SIEMPRE contra el total del mes de todas las
// categorías, no contra la suma de las que se ven: es la pregunta "qué parte de
// lo que entró ese mes fue esto".
//
// En "Todas, apiladas" se dibujan las ocho principales y el resto NO: una
// franja gris de "Otras" con quince categorías ocupaba un tercio del alto y a
// vista ejecutiva se leía como la categoría predominante. El resto sigue en la
// tabla de referencia (cada columna suma 100%) y en el resumen.

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
const pct = (parte, total) => (total ? (parte / total) * 100 : 0);

// Techo "limpio" para el eje: cuatro tramos iguales de 1, 1,2, 1,5, 2, 2,5, 3,
// 4, 5, 6, 8 o 10 × potencia de 10. Con el máximo crudo × 1,2 el eje salía
// desparejo (0, 35, 70, 137).
function techoEje(valor) {
  if (!(valor > 0)) return 1;
  const tramo = valor / 4;
  const magnitud = 10 ** Math.floor(Math.log10(tramo));
  const factor = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((c) => c * magnitud >= tramo);
  return factor * magnitud * 4;
}

// El primer lugar nunca se usa (la categoría principal va en el amarillo del
// máximo), así que ahí queda --c6: es un ámbar que en la quinta posición se
// confundía con ese amarillo, y en el tablero el amarillo significa "máximo".
const PALETA = [
  "var(--c6)", "var(--c2)", "var(--c4)", "var(--c3)",
  "var(--c7)", "var(--c1)", "var(--c8)", "var(--c5)",
];
const OTRAS = "var(--ink-3)";
const TODAS = "__todas";

export default function EvolucionApilada({ series, tope = 6, seleccionado = "" }) {
  const ids = useIdsGrafico();
  const idSelect = useId();
  const principal = series?.[0]?.tipo || "";
  const inicial = seleccionado || principal;
  const meses = series?.[0]?.puntos.map((p) => p.name) || [];
  const claveMeses = meses.join("|");

  const [elegida, setElegida] = useState(inicial);
  const [modo, setModo] = useState("cantidad"); // "cantidad" | "pct"
  const [rango, setRango] = useState([0, Math.max(meses.length - 1, 0)]);

  // Cambió la categoría elegida en los filtros, o el período movió cuál es la
  // principal: se vuelve a arrancar desde esa.
  useEffect(() => {
    setElegida(inicial);
  }, [inicial]);

  // Si el tablero cambia los meses disponibles, el período vuelve a ser todo.
  useEffect(() => {
    setRango([0, Math.max(meses.length - 1, 0)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveMeses]);

  if (!series || series.length === 0) {
    return <div className="state">Sin datos para el rango elegido.</div>;
  }

  const ultimo = meses.length - 1;
  const desde = Math.min(rango[0], ultimo);
  const hasta = Math.min(Math.max(rango[1], desde), ultimo);
  const enRango = (arr) => arr.slice(desde, hasta + 1);
  const mesesRango = enRango(meses);
  const periodoTexto = desde === hasta
    ? cap(meses[desde])
    : `${cap(meses[desde])} y ${cap(meses[hasta])}`;

  // Total de TODAS las categorías en cada mes: la base de la participación.
  const totalMes = meses.map((_, i) => series.reduce((acc, s) => acc + (s.puntos[i]?.value || 0), 0));
  const totalMesRango = enRango(totalMes);
  const totalRango = totalMesRango.reduce((a, b) => a + b, 0);

  const vistaTodas = elegida === TODAS;
  // Si la categoría guardada ya no está en la vista, se vuelve a la principal.
  const serie = vistaTodas ? null : series.find((s) => s.tipo === elegida) || series[0];

  // --- Controles --------------------------------------------------------------
  const barra = (
    <div className="evol-toolbar">
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

      <div className="evol-controles">
        {/* Período: dos meses subrayados en punteado con un ícono de calendario.
            Se leen como texto pero se ven tocables, sin armar otra barra de
            filtros adentro del panel. */}
        {meses.length > 1 && (
          <div className="evol-rango" role="group" aria-label="Período del gráfico" title="Cambiar el período">
            <svg className="evol-rango-icono" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M2 6.5h12M5.5 1.8v2.6M10.5 1.8v2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <select
              aria-label="Desde"
              value={desde}
              onChange={(e) => setRango([Number(e.target.value), hasta])}
            >
              {meses.map((m, i) => (
                <option key={m} value={i} disabled={i > hasta}>{cap(m)}</option>
              ))}
            </select>
            <span aria-hidden="true">–</span>
            <select
              aria-label="Hasta"
              value={hasta}
              onChange={(e) => setRango([desde, Number(e.target.value)])}
            >
              {meses.map((m, i) => (
                <option key={m} value={i} disabled={i < desde}>{cap(m)}</option>
              ))}
            </select>
            {(desde !== 0 || hasta !== ultimo) && (
              <button type="button" className="evol-reset" onClick={() => setRango([0, ultimo])}>
                Todo el período
              </button>
            )}
          </div>
        )}

        <div className="evol-modo" role="group" aria-label="Qué mide el gráfico">
          <button type="button" aria-pressed={modo === "cantidad"} onClick={() => setModo("cantidad")}>
            Cantidad
          </button>
          <button type="button" aria-pressed={modo === "pct"} onClick={() => setModo("pct")}>
            % del mes
          </button>
        </div>
      </div>
    </div>
  );

  // --- Una categoría ----------------------------------------------------------
  if (!vistaTodas) {
    const datos = mesesRango.map((mes, j) => {
      const i = desde + j;
      const cantidad = serie.puntos[i]?.value || 0;
      const participacion = pct(cantidad, totalMes[i]);
      return {
        mes: cap(mes),
        cantidad,
        participacion,
        totalMes: totalMes[i],
        value: modo === "pct" ? +participacion.toFixed(1) : cantidad,
      };
    });
    const idxMax = indiceMaximo(datos);
    const idxMasCant = indiceMaximo(datos, "cantidad");
    const idxMasPart = indiceMaximo(datos, "participacion");
    const cantRango = datos.reduce((acc, d) => acc + d.cantidad, 0);

    // Debajo de cada mes va la OTRA medida: en modo cantidad el porcentaje del
    // mes, y en modo porcentaje la cantidad. Así cada mes muestra las dos.
    const TickMes = ({ x, y, payload, index }) => {
      const d = datos[index];
      if (!d) return null;
      const referencia = modo === "pct" ? nf(d.cantidad) : `${nf(d.participacion, 1)}%`;
      const destaca = modo === "pct" ? index === idxMasCant : index === idxMasPart;
      return (
        <g transform={`translate(${x},${y})`}>
          <text dy={14} textAnchor="middle" fill="var(--ink-3)" fontSize={12}>{payload.value}</text>
          <text dy={30} textAnchor="middle" fontSize={11} fontWeight={600}
            fill={destaca ? MAXIMO : "var(--ink-2)"}>
            {referencia}
          </text>
        </g>
      );
    };

    return (
      <>
        {barra}

        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={datos} margin={{ left: -8, right: 24, top: 28 }}>
            {defsGrafico(ids)}
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
            {/* Margen a los costados: si el mes pico es el primero o el último,
                su etiqueta quedaba encima de los números del eje vertical. */}
            <XAxis dataKey="mes" tick={<TickMes />} height={46} interval={0}
              padding={{ left: 28, right: 28 }} />
            {/* Aire arriba del máximo: sin esto la etiqueta del mes pico queda
                contra el borde y se pisa con el último número del eje. */}
            <YAxis
              tick={{ fontSize: 12, fill: "var(--ink-3)" }}
              allowDecimals={modo === "pct"}
              domain={[0, (max) => techoEje(max * 1.15)]}
              tickCount={5}
              tickFormatter={(v) => (modo === "pct" ? `${v}%` : nf(v))}
            />
            <Tooltip
              {...TOOLTIP}
              formatter={(_, __, p) => [
                `${nf(p.payload.cantidad)} denuncias · ${nf(p.payload.participacion, 1)}% del mes (${nf(p.payload.totalMes)})`,
                serie.tipo,
              ]}
            />
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
                    {modo === "pct" ? `${nf(value, 1)}%` : nf(value)}
                  </text>
                )}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>

        <p className="evol-resumen">
          <b>{serie.tipo}</b>{desde === hasta ? ` en ${periodoTexto}` : ` entre ${periodoTexto}`}:{" "}
          {nf(cantRango)} denuncias, el {nf(pct(cantRango, totalRango), 1)}% del total del período
          ({nf(totalRango)}).
          {idxMasCant >= 0 && (
            <>
              {" "}Mes con más denuncias: <b style={{ color: MAXIMO }}>{datos[idxMasCant].mes}</b>{" "}
              ({nf(datos[idxMasCant].cantidad)}).
            </>
          )}
          {idxMasPart >= 0 && (
            <>
              {" "}Mayor participación: <b>{datos[idxMasPart].mes}</b>, con el{" "}
              {nf(datos[idxMasPart].participacion, 1)}% de las denuncias de ese mes.
            </>
          )}
        </p>
      </>
    );
  }

  // --- Todas, apiladas --------------------------------------------------------
  const enPct = modo === "pct";
  const visibles = series.slice(0, tope);
  const cola = series.slice(tope);
  // dataKey por posición y no por nombre: Recharts lee el dataKey como una ruta
  // con puntos, y hay etiquetas como "Sin señalizar." que la romperían.
  const capas = visibles.map((s, i) => ({
    dk: `s${i}`,
    nombre: s.tipo,
    color: i === 0 ? MAXIMO : PALETA[i % PALETA.length],
    valores: enRango(s.puntos.map((p) => p.value || 0)),
  }));
  // El resto no se dibuja: solo va a la tabla y al resumen.
  const resto = cola.length
    ? {
        nombre: `Resto (${cola.length} categorías)`,
        valores: enRango(meses.map((_, i) => cola.reduce((acc, s) => acc + (s.puntos[i]?.value || 0), 0))),
      }
    : null;

  const datos = mesesRango.map((mes, j) => {
    const fila = { mes: cap(mes), __total: totalMesRango[j] };
    capas.forEach((c) => {
      fila[`${c.dk}_n`] = c.valores[j];
      // En % cada franja mide su parte del total REAL del mes (no un 100%
      // repartido entre las que se ven): lo que falta hasta 100 es el resto.
      fila[c.dk] = enPct ? +pct(c.valores[j], totalMesRango[j]).toFixed(2) : c.valores[j];
    });
    return fila;
  });

  const sumaPrincipales = capas.reduce((acc, c) => acc + c.valores.reduce((a, b) => a + b, 0), 0);
  const sumaResto = resto ? resto.valores.reduce((a, b) => a + b, 0) : 0;

  // Categoría con mayor participación en cada mes.
  const lideres = mesesRango.map((_, j) => {
    let mejor = 0;
    capas.forEach((c, k) => { if (c.valores[j] > capas[mejor].valores[j]) mejor = k; });
    return mejor;
  });

  const filasTabla = [
    ...capas.map((c, k) => ({ ...c, clave: c.dk, indice: k, esResto: false })),
    ...(resto ? [{ ...resto, clave: "resto", color: OTRAS, esResto: true }] : []),
  ];

  return (
    <>
      {barra}

      <ResponsiveContainer width="100%" height={360}>
        <AreaChart data={datos} margin={{ left: -8, right: 16, top: 10 }}>
          {defsGrafico(ids, { colores: capas.map((c) => c.color) })}
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
          <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--ink-3)" }} interval={0} />
          <YAxis
            tick={{ fontSize: 12, fill: "var(--ink-3)" }}
            allowDecimals={false}
            domain={[0, (max) => techoEje(enPct ? max : max * 1.05)]}
            tickCount={5}
            tickFormatter={(v) => (enPct ? `${nf(v)}%` : nf(v))}
          />
          <Tooltip
            {...TOOLTIP}
            labelFormatter={(l, payload) => {
              const total = payload?.[0]?.payload?.__total;
              return total !== undefined ? `${l} · ${nf(total)} denuncias` : l;
            }}
            formatter={(_, n, item) => {
              const cantidad = item.payload[`${item.dataKey}_n`];
              return [`${nf(cantidad)} · ${nf(pct(cantidad, item.payload.__total), 1)}%`, n];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={9} />
          {/* Recharts apila en el orden en que se declaran: la categoría más
              grande abajo, apoyada en el eje. */}
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

      {/* Referencia mes a mes: participación de cada categoría sobre el total
          de denuncias de ese mes. Con la fila del resto, cada columna suma 100%. */}
      <div className="tabla-scroll">
        <table className="tabla-participacion">
          <thead>
            <tr>
              <th scope="col">Participación</th>
              {mesesRango.map((m) => <th key={m} scope="col">{cap(m).slice(0, 3)}</th>)}
              <th scope="col" className="col-periodo">Período</th>
            </tr>
          </thead>
          <tbody>
            {filasTabla.map((f) => {
              const suma = f.valores.reduce((a, b) => a + b, 0);
              return (
                <tr key={f.clave} className={f.esResto ? "fila-resto" : undefined}>
                  <th scope="row"><i style={{ background: f.color }} />{f.nombre}</th>
                  {f.valores.map((v, j) => (
                    <td key={j} className={!f.esResto && lideres[j] === f.indice ? "lider" : undefined}
                      title={`${nf(v)} de ${nf(totalMesRango[j])} denuncias`}>
                      {nf(pct(v, totalMesRango[j]), 1)}%
                    </td>
                  ))}
                  <td className="col-periodo" title={`${nf(suma)} de ${nf(totalRango)} denuncias`}>
                    {nf(pct(suma, totalRango), 1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Denuncias del mes</th>
              {totalMesRango.map((t, j) => <td key={j}>{nf(t)}</td>)}
              <td className="col-periodo">{nf(totalRango)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="evol-resumen">
        Las {capas.length} categorías principales explican el{" "}
        <b>{nf(pct(sumaPrincipales, totalRango), 1)}%</b> de las denuncias
        {desde === hasta ? ` de ${periodoTexto}` : ` entre ${periodoTexto}`}.
        {resto && (
          <>
            {" "}Las otras {cola.length} ({nf(pct(sumaResto, totalRango), 1)}%) no se dibujan para
            que el gráfico se lea de un vistazo; figuran en la tabla como “Resto”.
          </>
        )}
        {" "}En amarillo, la categoría que más pesó en cada mes.
      </p>
    </>
  );
}
