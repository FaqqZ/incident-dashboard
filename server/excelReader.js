// excelReader.js
// Lee el Excel de incidentes con SheetJS replicando el modelo de Power BI:
//   Hoja "bd"                        -> incidentes (una fila = un incidente)
//   Hoja "coordenadas-cam-actualizado" -> cámaras (id, DIRECCION, COORDENADAS)
// La posición en el mapa se resuelve por la RELACIÓN bd[dispositivo] -> cam[id],
// no por columnas de coordenadas dentro de bd. Acá ese cruce se hace en el
// backend (equivale a la relación 1->* de Power BI).

const XLSX = require("xlsx");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Utilidades de texto / detección de columnas
// ---------------------------------------------------------------------------
function normalizeKey(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Busca, dentro de los encabezados reales, el que coincide con alguno de los alias.
function pickColumn(headers, aliases) {
  const norm = headers.map((h) => ({ raw: h, norm: normalizeKey(h) }));
  for (const alias of aliases) {
    const a = normalizeKey(alias);
    const hit = norm.find((h) => h.norm === a) || norm.find((h) => h.norm.includes(a));
    if (hit) return hit.raw;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Detección de hojas
// ---------------------------------------------------------------------------
// Hoja de incidentes: la llamada "bd". Hoja de cámaras: la que contiene
// "actualizado" (así NO tomamos la vieja "coordenadas-cam").
function findSheetName(wb, { exact = [], contains = [] }) {
  const names = wb.SheetNames;
  for (const target of exact) {
    const hit = names.find((n) => normalizeKey(n) === normalizeKey(target));
    if (hit) return hit;
  }
  for (const frag of contains) {
    const hit = names.find((n) => normalizeKey(n).includes(normalizeKey(frag)));
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parseo de valores
// ---------------------------------------------------------------------------
function toFloat(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", ".").trim());
  return Number.isNaN(n) ? null : n;
}

function parseDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const utcDays = Math.floor(value - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = "20" + y;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(date.getTime())) return date;
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toISODate(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// ---------------------------------------------------------------------------
// Correcciones de id (equivale a Table.ReplaceValue de Power Query)
// Agregá acá cualquier id que en bd no matchee con la hoja de cámaras.
// ---------------------------------------------------------------------------
const ID_FIXES = {
  "DO-001": "DOM001",
};
function fixId(id) {
  const key = String(id).trim();
  return ID_FIXES[key] || key;
}

// ---------------------------------------------------------------------------
// Formateo de DIRECCION a mayúscula inicial respetando conectores (opcional,
// estético — equivale a la columna personalizada de Power Query).
// ---------------------------------------------------------------------------
const CONECTORES = new Set(["de", "del", "la", "las", "los", "el", "y", "a", "en"]);
function formatDireccion(dir) {
  if (!dir) return dir;
  const palabras = String(dir).trim().toLowerCase().split(/\s+/);
  return palabras
    .map((w, i) => {
      // conserva números y abreviaturas con punto (AV., N°) tal cual en mayúsculas
      if (i > 0 && CONECTORES.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// Carga de la hoja de CÁMARAS -> mapa id -> { lat, lng, direccion }
// ---------------------------------------------------------------------------
function loadCameras(wb, sheetName) {
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (rows.length === 0) return { byId: new Map(), meta: { filas: 0, columnas: {} } };

  const headers = Object.keys(rows[0]);
  const colId = pickColumn(headers, ["id"]);
  const colDir = pickColumn(headers, ["direccion", "dirección"]);
  const colCoord = pickColumn(headers, ["coordenadas", "coordenada", "coords"]);
  const colLat = pickColumn(headers, ["latitud", "lat", "y"]);
  const colLng = pickColumn(headers, ["longitud", "lng", "lon", "x"]);

  const byId = new Map();
  let sinCoords = 0;

  for (const row of rows) {
    const rawId = clean(row[colId]);
    if (!rawId) continue;
    const id = fixId(rawId);

    let lat = null;
    let lng = null;
    if (colCoord && row[colCoord]) {
      const parts = String(row[colCoord]).split(/[,;]\s*/);
      if (parts.length >= 2) {
        lat = toFloat(parts[0]);
        lng = toFloat(parts[1]);
      }
    } else if (colLat && colLng) {
      lat = toFloat(row[colLat]);
      lng = toFloat(row[colLng]);
    }
    if (lat === null || lng === null) sinCoords++;

    byId.set(id, {
      id,
      lat,
      lng,
      direccion: formatDireccion(clean(row[colDir])) || "Sin dirección",
    });
  }

  return {
    byId,
    meta: {
      filas: rows.length,
      camaras: byId.size,
      sinCoordenadas: sinCoords,
      columnas: { id: colId, direccion: colDir, coordenadas: colCoord },
    },
  };
}

// ---------------------------------------------------------------------------
// Carga de la hoja BD (incidentes) + join con cámaras
// ---------------------------------------------------------------------------
function loadIncidents(filePath, opts = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró el archivo Excel en: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath, { cellDates: true });

  const bdSheet =
    opts.bdSheet ||
    findSheetName(wb, { exact: ["bd"], contains: ["bd", "incident", "base"] });
  const camSheet =
    opts.camSheet ||
    findSheetName(wb, {
      contains: ["actualizado", "coordenadas-cam-actualizado", "camaras", "cámaras"],
    });

  if (!bdSheet) throw new Error('No se encontró la hoja de incidentes ("bd").');
  if (!camSheet)
    throw new Error(
      'No se encontró la hoja de cámaras (se busca la que contiene "actualizado").'
    );

  const cameras = loadCameras(wb, camSheet);

  const sheet = wb.Sheets[bdSheet];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];

  const colDisp = pickColumn(headers, ["dispositivo", "camara", "cámara", "id_camara"]);
  const colFecha = pickColumn(headers, ["fecha", "fecha_hora", "date"]);
  const colCat = pickColumn(headers, ["categoria", "categoría", "tipo"]);
  const colTurno = pickColumn(headers, ["turno", "franja"]);
  const colNaturaleza = pickColumn(headers, ["naturaleza", "naturaleaza", "nat"]);

  const records = [];
  let vacios = 0;
  let sinCamara = 0;

  for (const row of rawRows) {
    const dispositivo = clean(row[colDisp]);
    // Power Query paso 2: descartar filas con dispositivo vacío/nulo
    if (!dispositivo) {
      vacios++;
      continue;
    }
    const disp = fixId(dispositivo);
    const cam = cameras.byId.get(disp) || null;
    if (!cam) sinCamara++;

    const date = colFecha ? parseDate(row[colFecha]) : null;
    const mesnro = date ? date.getMonth() + 1 : null;

    records.push({
      id: records.length + 1,
      dispositivo: disp,
      categoria: clean(row[colCat]) || "Sin categoría",
      turno: clean(row[colTurno]) || "Sin turno",
      naturaleza: clean(row[colNaturaleza]) || "Sin naturaleza",
      fecha: toISODate(date),
      mes: mesnro ? MESES_ES[mesnro - 1] : null,
      mesnro,
      clase: disp.slice(0, 3).toUpperCase(), // CAM / DOM
      // datos que vienen de la cámara vía la relación:
      direccion: cam ? cam.direccion : "Sin ubicación",
      lat: cam ? cam.lat : null,
      lng: cam ? cam.lng : null,
    });
  }

  return {
    records,
    meta: {
      hojaIncidentes: bdSheet,
      hojaCamaras: camSheet,
      totalFilas: rawRows.length,
      registrosReales: records.length,
      filasVacias: vacios,
      incidentesSinCamara: sinCamara,
      columnasBD: { dispositivo: colDisp, fecha: colFecha, categoria: colCat, turno: colTurno, naturaleza: colNaturaleza },
      camaras: cameras.meta,
    },
  };
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------
function applyFilters(records, { from, to, categoria, turno, mes, clase, naturaleza } = {}) {
  return records.filter((r) => {
    if (from && (!r.fecha || r.fecha < from)) return false;
    if (to && (!r.fecha || r.fecha > to)) return false;
    if (categoria && r.categoria !== categoria) return false;
    if (turno && r.turno !== turno) return false;
    if (mes && r.mes !== mes) return false;
    if (clase && r.clase !== clase) return false;
    if (naturaleza && r.naturaleza !== naturaleza) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Agregaciones (equivalen a las medidas DAX)
// ---------------------------------------------------------------------------
function countBy(records, key) {
  const acc = new Map();
  for (const r of records) {
    const k = r[key] || "Sin dato";
    acc.set(k, (acc.get(k) || 0) + 1);
  }
  return Array.from(acc, ([name, value]) => ({ name, value })).sort(
    (a, b) => b.value - a.value
  );
}

// Total incidentes = COUNTROWS(bd)
function total(records) {
  return records.length;
}

// Categoría Top / Turno Top
function topBy(records, key) {
  const ranking = countBy(records, key);
  return ranking.length ? { name: ranking[0].name, count: ranking[0].value } : null;
}

// Punto Top = DIRECCION con más incidentes
function puntoTop(records) {
  const ranking = countBy(
    records.filter((r) => r.direccion && r.direccion !== "Sin ubicación"),
    "direccion"
  );
  if (!ranking.length) return null;
  // recupera el dispositivo asociado (el primero que matchee esa dirección)
  const dir = ranking[0].name;
  const disp = (records.find((r) => r.direccion === dir) || {}).dispositivo || null;
  return { direccion: dir, dispositivo: disp, count: ranking[0].value };
}

// Punto Top de la Categoría Principal
// (categoría líder -> punto donde más ocurre esa categoría)
function puntoTopCategoriaPrincipal(records) {
  const catLider = topBy(records, "categoria");
  if (!catLider) return null;
  const subset = records.filter(
    (r) => r.categoria === catLider.name && r.direccion !== "Sin ubicación"
  );
  const ranking = countBy(subset, "direccion");
  if (!ranking.length) return { categoria: catLider.name, direccion: null, count: 0 };
  return { categoria: catLider.name, direccion: ranking[0].name, count: ranking[0].value };
}

// Ranking de puntos críticos (para el gráfico de barras)
function rankingPuntos(records, topN = 12) {
  return countBy(
    records.filter((r) => r.direccion && r.direccion !== "Sin ubicación"),
    "direccion"
  )
    .slice(0, topN)
    .map((r) => ({ name: r.name, value: r.value }));
}

// Evolución mensual (ordenada por número de mes)
function porMes(records) {
  const acc = new Map();
  for (const r of records) {
    if (!r.mes) continue;
    if (!acc.has(r.mes)) acc.set(r.mes, { name: r.mes, mesnro: r.mesnro, value: 0 });
    acc.get(r.mes).value++;
  }
  return Array.from(acc.values()).sort((a, b) => a.mesnro - b.mesnro);
}

// Puntos del mapa: agregados por cámara (tamaño = cantidad de incidentes).
// Equivale al mapa de Power BI con Size = Recuento de dispositivo.
// Ahora incluye desglose por categoría para el mapa de calor discriminado.
function buildMapPoints(records) {
  const acc = new Map();
  for (const r of records) {
    if (r.lat === null || r.lng === null) continue;
    if (!acc.has(r.dispositivo)) {
      acc.set(r.dispositivo, {
        dispositivo: r.dispositivo,
        direccion: r.direccion,
        lat: r.lat,
        lng: r.lng,
        count: 0,
        porCategoria: {},
      });
    }
    const point = acc.get(r.dispositivo);
    point.count++;
    // Acumular por categoría
    const cat = r.categoria || "Sin categoría";
    point.porCategoria[cat] = (point.porCategoria[cat] || 0) + 1;
  }
  return Array.from(acc.values());
}

function buildKpis(records) {
  return {
    total: total(records),
    categoriaTop: topBy(records, "categoria"),
    turnoTop: topBy(records, "turno"),
    puntoTop: puntoTop(records),
    puntoTopCategoriaPrincipal: puntoTopCategoriaPrincipal(records),
  };
}

function buildFilterOptions(records) {
  const fechas = records.map((r) => r.fecha).filter(Boolean).sort();
  const meses = Array.from(
    new Map(records.filter((r) => r.mes).map((r) => [r.mes, r.mesnro])).entries()
  )
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);

  return {
    categorias: Array.from(new Set(records.map((r) => r.categoria))).sort(),
    turnos: Array.from(new Set(records.map((r) => r.turno))).sort(),
    naturalezas: Array.from(new Set(records.map((r) => r.naturaleza))).sort(),
    meses, // ya ordenados ene->dic
    clases: Array.from(new Set(records.map((r) => r.clase))).sort(),
    rangoFechas: {
      min: fechas.length ? fechas[0] : null,
      max: fechas.length ? fechas[fechas.length - 1] : null,
    },
  };
}

module.exports = {
  loadIncidents,
  applyFilters,
  countBy,
  porMes,
  rankingPuntos,
  buildKpis,
  buildFilterOptions,
  buildMapPoints,
};
