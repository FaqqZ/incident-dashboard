// MatrizMesTipo.jsx — la planilla original, mes × tipo, como tabla de referencia.
//
// Es el dato crudo tal como lo entrega la Patrulla, y sirve para dos cosas:
// chequear cualquier número del tablero contra el Excel, y leer de un vistazo
// en qué mes se concentró cada tipo.
//
// La intensidad del fondo se calcula POR COLUMNA, no sobre toda la tabla: si
// se normalizara contra el máximo global (Prevención, 723), las ocho columnas
// restantes quedarían todas en blanco y la tabla no diría nada. Y el mes pico
// de cada tipo se marca en amarillo, igual que en los mini gráficos.

const nf = (v) => (v ?? 0).toLocaleString("es-AR");
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function MatrizMesTipo({ matriz, seleccionado, onSelect }) {
  if (!matriz || !matriz.filas.length) {
    return <div className="state">Sin datos para el rango elegido.</div>;
  }

  const { tipos, filas, totalesPorTipo, total } = matriz;

  // Máximo de cada columna, para la intensidad y para marcar el mes pico.
  const maxPorTipo = {};
  tipos.forEach((t) => {
    maxPorTipo[t] = filas.reduce((m, f) => Math.max(m, f.valores[t] || 0), 0);
  });
  const maxFila = filas.reduce((m, f) => Math.max(m, f.total), 0);

  const fondo = (valor, max) => {
    if (!max || !valor) return undefined;
    // Piso en 6%: un valor bajo pero presente tiene que distinguirse del cero.
    const pct = Math.round(6 + (valor / max) * 46);
    return `color-mix(in srgb, var(--graf-serie) ${pct}%, transparent)`;
  };

  return (
    <div className="tabla-scroll">
      <table className="tabla-matriz">
        <thead>
          <tr>
            <th scope="col" className="col-mes">Mes</th>
            {tipos.map((t) => (
              <th key={t} scope="col">
                <button
                  type="button"
                  className={`th-boton${seleccionado === t ? " activo" : ""}`}
                  onClick={() => onSelect(t)}
                >
                  {t}
                </button>
              </th>
            ))}
            <th scope="col" className="col-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.mesnro}>
              <th scope="row" className="col-mes">{cap(f.mes)}</th>
              {tipos.map((t) => {
                const v = f.valores[t] || 0;
                const esPico = maxPorTipo[t] > 0 && v === maxPorTipo[t];
                return (
                  <td
                    key={t}
                    className={esPico ? "pico" : undefined}
                    style={{ background: fondo(v, maxPorTipo[t]) }}
                  >
                    {v === 0 ? <span className="cero">—</span> : nf(v)}
                  </td>
                );
              })}
              <td className={`col-total${f.total === maxFila ? " pico" : ""}`}>{nf(f.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="col-mes">Total</th>
            {tipos.map((t) => <td key={t}>{nf(totalesPorTipo[t])}</td>)}
            <td className="col-total">{nf(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
