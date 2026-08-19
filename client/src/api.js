// api.js — llamadas al backend. En dev, Vite hace proxy de /api -> :4000.

function qs(params) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== "")
  );
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : "";
}

export async function fetchDashboard(filters) {
  const res = await fetch(`/api/dashboard${qs(filters)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al cargar el dashboard`);
  }
  return res.json();
}

export async function fetchOptions() {
  const res = await fetch("/api/options");
  if (!res.ok) throw new Error("No se pudieron cargar las opciones de filtro");
  return res.json();
}

// --- Recurrencia territorial de siniestros viales (COMM) ---
export async function fetchRecurrencia(filtros) {
  const res = await fetch(`/api/recurrencia${qs(filtros)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al cargar la recurrencia`);
  }
  return res.json();
}

export async function fetchRecurrenciaOptions() {
  const res = await fetch("/api/recurrencia/options");
  if (!res.ok) throw new Error("No se pudieron cargar los filtros de recurrencia");
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch("/api/health");
  return res.json();
}

// --- Indicadores descriptivos de siniestralidad vial (dashboard del COMM) ---
export async function fetchIndicadoresSV() {
  const res = await fetch("/api/siniestros/indicadores");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al cargar los indicadores`);
  }
  return res.json();
}

// --- Análisis por categoría (metodología COMM generalizada) ---
export async function fetchAnalisisCategoria(categoria) {
  const res = await fetch(`/api/categoria/analisis${qs({ categoria })}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al cargar el análisis`);
  }
  return res.json();
}
