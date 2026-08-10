// KpiCard.jsx — tarjeta de indicador para el layout ejecutivo.

export default function KpiCard({ label, value, hint, accent }) {
  return (
    <div className="kpi" style={{ "--accent": accent || "var(--brand)" }}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
