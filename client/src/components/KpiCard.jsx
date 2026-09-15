// KpiCard.jsx — tarjeta de indicador para el layout ejecutivo.
//
// El valor no siempre es un número corto: hay KPIs cuyo valor es un nombre
// ("Emergencia eléctrica", "Defensa Civil Municipal") o una dirección. Con el
// cuerpo de 35px esos textos se cortaban contra el borde de la tarjeta, que
// recorta por el overflow del acento lateral. Por eso el tamaño baja según el
// largo: es lo único que el CSS solo no puede decidir.

// Los cortes son bajos a propósito: con el cuerpo de 35px entran unos nueve
// caracteres en una tarjeta de la grilla de seis. Pasado eso el navegador parte
// la palabra al medio ("Prevencio/n"), que es peor que bajar el tamaño.
function claseSegunLargo(value) {
  if (typeof value !== "string") return "";
  if (value.length > 20) return " muy-largo";
  if (value.length > 9) return " largo";
  return "";
}

export default function KpiCard({ label, value, hint, accent }) {
  return (
    <div className="kpi" style={{ "--accent": accent || "var(--brand)" }}>
      <div className="label">{label}</div>
      <div className={`value${claseSegunLargo(value)}`}>{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
