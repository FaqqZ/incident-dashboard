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

// --- Patrulla de Protección Ciudadana ---
export async function fetchPPC(filtros) {
  const res = await fetch(`/api/ppc${qs(filtros)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al cargar los datos de la PPC`);
  }
  return res.json();
}

export async function fetchPPCOptions() {
  const res = await fetch("/api/ppc/options");
  if (!res.ok) throw new Error("No se pudieron cargar los filtros de la PPC");
  return res.json();
}

// --- Defensa Civil ---
export async function fetchDC(filtros) {
  const res = await fetch(`/api/dc${qs(filtros)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al cargar los datos de Defensa Civil`);
  }
  return res.json();
}

export async function fetchDCOptions() {
  const res = await fetch("/api/dc/options");
  if (!res.ok) throw new Error("No se pudieron cargar los filtros de Defensa Civil");
  return res.json();
}

// --- Áreas (casos de estudio) de la Subsecretaría ---
export async function fetchAreas() {
  const res = await fetch("/api/areas");
  if (!res.ok) throw new Error(`Error ${res.status} al cargar las áreas`);
  return res.json();
}
