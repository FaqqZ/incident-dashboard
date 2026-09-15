// IndicadoresSV.jsx — indicadores descriptivos de siniestralidad vial.
// Replica el dashboard que el COMM ya tiene en Excel (hoja "Dashboard").
//
// Son del período completo que trae la planilla y NO responden a los filtros
// del mapa: el Excel los calcula sobre el acumulado. El período se arma con los
// meses presentes en los datos — antes decía "enero–julio" fijo.

import { useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, LabelList,
} from "recharts";
import { fetchIndicadoresSV } from "../api";
import KpiCard from "./KpiCard";
import { SERIE, MAXIMO, TOOLTIP, indiceMaximo, colorSegunMaximo, dotMaximo } from "../chartTheme";

const nf = (n, d = 0) =>
  (n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function IndicadoresSV() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchIndicadoresSV()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="banner-warning" style={{ marginBottom: 20 }}>
        No se pudieron calcular los indicadores: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="state" style={{ minHeight: 160 }}>
        <div className="spinner" />
        <div className="big">Calculando indicadores…</div>
      </div>
    );
  }

  const { kpis: k } = data;
  const variacion = k.variacionUltimoMes;
  const ultimoMes = data.porMes[data.porMes.length - 1]?.name;
  const periodo = data.porMes.length
    ? `${cap(data.porMes[0].name)}–${data.porMes[data.porMes.length - 1].name} ${data.meta.anio}`
    : "";

  // Índices del valor más alto de cada serie: ese va en amarillo.
  const idxMes = indiceMaximo(data.porMes);
  const idxDia = indiceMaximo(data.porDiaSemana);
  const idxFranja = indiceMaximo(data.porFranja);

  return (
    <>
      <section className="kpi-grid">
        <KpiCard label="SV detectados" value={nf(k.total)}
          hint={`Acumulado en ${data.porMes.length} meses`} accent="var(--color-3)" />
        <KpiCard label="Promedio diario de SV" value={nf(k.promedioDiario, 2)}
          hint={`Sobre ${nf(k.diasPeriodo)} días del período`} accent="var(--color-4)" />
        <KpiCard label="Var. último mes"
          value={variacion === null ? "—" : `${variacion > 0 ? "+" : ""}${nf(variacion, 2)}%`}
          hint={ultimoMes ? `${cap(ultimoMes)} contra el mes previo` : ""}
          accent={variacion > 0 ? "var(--c5)" : "var(--c4)"} />
        <KpiCard label="SV con lesiones" value={`${nf(k.pctConLesiones, 1)}%`}
          hint={`${nf(k.conLesiones)} de ${nf(k.total)} siniestros`} accent="var(--c5)" />
      </section>

      <section className="charts-section" style={{ marginBottom: 20 }}>
        <div className="panel panel-wide">
          <h3>Evolución mensual de siniestros viales detectados</h3>
          <p className="panel-sub">{periodo}</p>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.porMes.map((m) => ({ ...m, label: cap(m.name) }))}
              margin={{ left: -18, right: 30, top: 24 }}>
              <defs>
                <linearGradient id="fillSV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIE} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SERIE} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-3)" }} />
              <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} allowDecimals={false} />
              <Tooltip {...TOOLTIP} formatter={(v) => [v, "Siniestros"]} />
              <Area type="monotone" dataKey="value" name="Siniestros" stroke={SERIE}
                strokeWidth={2.5} fill="url(#fillSV)" isAnimationActive={false}
                dot={dotMaximo(idxMes)}>
                <LabelList dataKey="value" position="top" offset={10}
                  style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }} />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="charts-grid">
          <div className="panel">
            <h3>Promedio de siniestros por día de la semana</h3>
            <p className="panel-sub">Acumulado {periodo}</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.porDiaSemana.map((d) => ({ ...d, label: cap(d.name) }))}
                margin={{ left: -20, right: 12, top: 22 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-3)" }} interval={0} />
                <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} />
                <Tooltip {...TOOLTIP}
                  formatter={(v, n, p) => [`${nf(v, 2)} por día (${p.payload.total} en total)`, "Promedio"]} />
                <Bar dataKey="value" name="Promedio" radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                  {data.porDiaSemana.map((d, i) => (
                    <Cell key={d.name} fill={colorSegunMaximo(i, idxDia)} />
                  ))}
                  <LabelList dataKey="value" position="top" offset={8}
                    formatter={(v) => nf(v, 1)}
                    style={{ fill: "var(--ink)", fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel">
            <h3>Distribución por franja horaria</h3>
            <p className="panel-sub">
              Acumulado {data.franjaMeses.map(cap).join("–")} 2026 ·{" "}
              {nf(data.franjaRegistros)} registros con hora cargada
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.porFranja} margin={{ left: -14, right: 12, top: 22 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--ink-3)" }} interval={0}
                  angle={-18} textAnchor="end" height={62} />
                <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} unit="%" />
                <Tooltip {...TOOLTIP}
                  formatter={(v, n, p) => [`${nf(v, 1)}% (${p.payload.total} siniestros)`, p.payload.detalle]} />
                <Bar dataKey="value" name="% del total" radius={[6, 6, 0, 0]} maxBarSize={52} isAnimationActive={false}>
                  {data.porFranja.map((f, i) => (
                    <Cell key={f.name} fill={colorSegunMaximo(i, idxFranja)} />
                  ))}
                  <LabelList dataKey="value" position="top" offset={8}
                    formatter={(v) => `${nf(v, 1)}%`}
                    style={{ fill: "var(--ink)", fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </>
  );
}
