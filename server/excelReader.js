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
  const colSubcat = pickColumn(headers, ["subcategoria", "subcategoría"]);
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
      subcategoria: clean(row[colSubcat]),
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
    // Se devuelve el mapa de cámaras para que el Excel de siniestralidad pueda
    // cruzar coordenadas por Dispositivo sin volver a parsear este archivo.
    cameras,
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

// ---------------------------------------------------------------------------
// RECURRENCIA TERRITORIAL DE SINIESTROS VIALES (COMM)
// ---------------------------------------------------------------------------
// Fuente: hoja "Hoja2" de "COM indicadores de siniestralidad...". Una fila por
// dispositivo donde se detectó al menos un siniestro vial en el período.
//
// IMPORTANTE: la clasificación (percentiles P75/P90/P95, clase, color y
// prioridad piloto) viene YA CALCULADA desde Excel y NO se recalcula acá, por
// pedido expreso de las instrucciones del COMM. Este módulo solo lee, valida y
// cruza contra las coordenadas de la base de cámaras por el código Dispositivo.
const CLASES_RECURRENCIA = ["MUY ALTA", "ALTA", "RELEVANTE", "BAJA"];
const COLORES_RECURRENCIA = ["ROJO", "NARANJA", "AMARILLO", "SIN SEÑAL"];
const PRIORIDADES = ["PRIORIDAD 1", "PRIORIDAD 2", "SIN PRIORIDAD"];

function loadRecurrencia(filePath, cameras) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró el Excel de siniestralidad en: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const hoja =
    findSheetName(wb, { exact: ["Hoja2"], contains: ["hoja2", "siniestr", "recurrenc"] }) ||
    wb.SheetNames[0];

  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: "" });
  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];

  const colDisp = pickColumn(headers, ["dispositivo"]);
  const colUbic = pickColumn(headers, ["ubicacion", "ubicación"]);
  const colAcum = pickColumn(headers, ["sv acumulados", "acumulados"]);
  const colProm = pickColumn(headers, ["sv promedio mensual", "promedio mensual", "promedio"]);
  const colMeses = pickColumn(headers, ["meses con sv", "meses"]);
  const colPers = pickColumn(headers, ["persistencia %", "persistencia"]);
  const colClase = pickColumn(headers, ["clase de recurrencia", "clase"]);
  const colColor = pickColumn(headers, ["color"]);
  const colPrio = pickColumn(headers, ["prioridad piloto", "prioridad"]);

  const puntos = [];
  let sinCoordenadas = 0;
  let filasVacias = 0;

  for (const row of rawRows) {
    const dispositivo = clean(row[colDisp]);
    if (!dispositivo) { filasVacias++; continue; }

    // Los ids de la hoja de cámaras vienen en mayúsculas, pero se prueban las
    // dos formas para no depender de eso.
    const idBase = fixId(dispositivo);
    const id = idBase.toUpperCase();
    const cam = cameras.byId.get(idBase) || cameras.byId.get(id) || null;
    if (!cam) sinCoordenadas++;

    // Persistencia viene como fracción (0,857). Se guarda 0-100 para el front.
    const persistenciaRaw = toFloat(row[colPers]);
    const persistencia =
      persistenciaRaw === null ? null : persistenciaRaw <= 1 ? persistenciaRaw * 100 : persistenciaRaw;

    puntos.push({
      dispositivo: id,
      ubicacion: clean(row[colUbic]) || (cam ? cam.direccion : "Sin ubicación"),
      svAcumulados: toFloat(row[colAcum]) ?? 0,
      svPromedioMensual: toFloat(row[colProm]) ?? 0,
      mesesConSV: toFloat(row[colMeses]) ?? 0,
      persistencia,
      clase: clean(row[colClase]) || "SIN CLASE",
      color: clean(row[colColor]) || "SIN SEÑAL",
      prioridad: clean(row[colPrio]) || "SIN PRIORIDAD",
      lat: cam ? cam.lat : null,
      lng: cam ? cam.lng : null,
    });
  }

  return {
    puntos,
    meta: {
      hoja,
      totalFilas: rawRows.length,
      puntosReales: puntos.length,
      filasVacias,
      sinCoordenadas,
      svTotales: puntos.reduce((s, p) => s + p.svAcumulados, 0),
      columnas: {
        dispositivo: colDisp, ubicacion: colUbic, svAcumulados: colAcum,
        svPromedioMensual: colProm, mesesConSV: colMeses, persistencia: colPers,
        clase: colClase, color: colColor, prioridad: colPrio,
      },
    },
  };
}

// Orden fijo (de mayor a menor recurrencia), no alfabético: en los selectores
// tiene que leerse como una escala, no como una lista.
function ordenarPor(valores, orden) {
  const presentes = new Set(valores);
  const conocidos = orden.filter((v) => presentes.has(v));
  const resto = [...presentes].filter((v) => !orden.includes(v)).sort();
  return [...conocidos, ...resto];
}

function opcionesRecurrencia(puntos) {
  return {
    clases: ordenarPor(puntos.map((p) => p.clase), CLASES_RECURRENCIA),
    colores: ordenarPor(puntos.map((p) => p.color), COLORES_RECURRENCIA),
    prioridades: ordenarPor(puntos.map((p) => p.prioridad), PRIORIDADES),
  };
}

function filtrarRecurrencia(puntos, { clase, color, prioridad } = {}) {
  return puntos.filter((p) => {
    if (clase && p.clase !== clase) return false;
    if (color && p.color !== color) return false;
    if (prioridad && p.prioridad !== prioridad) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Análisis por categoría: generaliza la metodología del COMM (percentiles
// P75/P90/P95 + persistencia) a cualquier categoría de la base de incidentes.
//
// Para "SINIESTROS VIALES." reproduce la planilla del COMM: mismas clases en
// los 244 puntos y los mismos 9 candidatos Prioridad 1 y 7 Prioridad 2.
//
// NO incluye franja horaria: la columna `fecha` guarda la hora en formato de 12
// horas sin AM/PM (coincide con la hora corregida del COMM solo en el 43% de
// los casos, y todas las diferencias son de +12 h). Hasta que el origen exporte
// hora en 24 h, ese gráfico daría un resultado equivocado.
// ---------------------------------------------------------------------------

// Escala completa: clase, color y a qué prioridad piloto puede aspirar.
// (CLASES_RECURRENCIA, más arriba, es solo el orden de los nombres.)
const ESCALA_RECURRENCIA = [
  { clase: "MUY ALTA", color: "ROJO", prioridad: "PRIORIDAD 1" },
  { clase: "ALTA", color: "NARANJA", prioridad: "PRIORIDAD 2" },
  { clase: "RELEVANTE", color: "AMARILLO", prioridad: null },
  { clase: "BAJA", color: "SIN SEÑAL", prioridad: null },
];

// PERCENTILE.INC (el método de Excel): interpolación lineal sobre q*(n-1).
function percentilInc(ordenados, q) {
  const i = q * (ordenados.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? ordenados[lo] : ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (i - lo);
}

// Agrupa por cámara y clasifica con los percentiles del conjunto recibido.
// Se usa tanto en el análisis por categoría como en el mapa del tablero, así
// los dos hablan el mismo idioma de colores.
function clasificarPuntos(registros, mesesObservados = 1, persistenciaMinima = 50) {
  const porDisp = new Map();
  registros.forEach((r) => {
    if (r.lat === null || r.lng === null) return;
    if (!porDisp.has(r.dispositivo)) {
      porDisp.set(r.dispositivo, {
        dispositivo: r.dispositivo,
        ubicacion: r.direccion,
        lat: r.lat,
        lng: r.lng,
        svAcumulados: 0,
        meses: new Set(),
        porCategoria: {},
      });
    }
    const p = porDisp.get(r.dispositivo);
    p.svAcumulados += 1;
    if (r.mes) p.meses.add(r.mes);
    const cat = r.categoria || "Sin categoría";
    p.porCategoria[cat] = (p.porCategoria[cat] || 0) + 1;
  });

  const counts = Array.from(porDisp.values())
    .map((p) => p.svAcumulados)
    .sort((a, b) => a - b);

  const cortes = counts.length
    ? { p75: percentilInc(counts, 0.75), p90: percentilInc(counts, 0.9), p95: percentilInc(counts, 0.95) }
    : { p75: 0, p90: 0, p95: 0 };

  // Con conjuntos chicos los tres percentiles pueden caer en el mismo entero:
  // ahí la clasificación no discrimina y la vista lo tiene que avisar en vez de
  // dibujar clases que no significan nada.
  const clasificacionUtil =
    new Set([Math.ceil(cortes.p75), Math.ceil(cortes.p90), Math.ceil(cortes.p95)]).size === 3;

  const puntos = Array.from(porDisp.values()).map((p) => {
    const idx =
      p.svAcumulados >= cortes.p95 ? 0 : p.svAcumulados >= cortes.p90 ? 1 : p.svAcumulados >= cortes.p75 ? 2 : 3;
    const def = ESCALA_RECURRENCIA[idx];
    const mesesConSV = p.meses.size;
    const persistencia = +((mesesConSV / mesesObservados) * 100).toFixed(4);
    return {
      dispositivo: p.dispositivo,
      ubicacion: p.ubicacion,
      direccion: p.ubicacion, // el popup del tablero lo lee así
      lat: p.lat,
      lng: p.lng,
      count: p.svAcumulados,
      porCategoria: p.porCategoria,
      svAcumulados: p.svAcumulados,
      svPromedioMensual: +(p.svAcumulados / mesesObservados).toFixed(4),
      mesesConSV,
      persistencia,
      clase: def.clase,
      color: def.color,
      // Mismo criterio del COMM: recurrencia alta o muy alta SOSTENIDA.
      prioridad:
        def.prioridad && persistencia >= persistenciaMinima ? def.prioridad : "SIN PRIORIDAD",
    };
  });

  return { puntos, cortes, clasificacionUtil };
}

function analizarCategoria(records, categoria, { persistenciaMinima = 50 } = {}) {
  const filtrados = categoria ? records.filter((r) => r.categoria === categoria) : records;

  // Meses observados: se toman de TODA la base, no de la categoría. Si una
  // categoría no tuvo casos en marzo, marzo igual fue un mes observado y tiene
  // que contar para el promedio y la persistencia.
  const mesesBase = Array.from(
    new Map(records.filter((r) => r.mes).map((r) => [r.mes, r.mesnro])).entries()
  ).sort((a, b) => a[1] - b[1]);
  const mesesObservados = mesesBase.length || 1;

  const acumMes = new Map();
  filtrados.forEach((r) => {
    if (r.mes) acumMes.set(r.mes, (acumMes.get(r.mes) || 0) + 1);
  });
  const porMes = mesesBase.map(([name, mesnro]) => ({
    name,
    mesnro,
    value: acumMes.get(name) || 0,
  }));

  const diasPeriodo = mesesBase.reduce((acc, [, mesnro]) => {
    const anio = Number((filtrados[0]?.fecha || records[0]?.fecha || "2026").slice(0, 4));
    const bis = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
    return acc + DIAS_POR_MES[mesnro - 1] + (mesnro === 2 && bis ? 1 : 0);
  }, 0);

  // --- Promedio por día de la semana ---
  const vecesPorDia = Object.fromEntries(DIAS_SEMANA.map((d) => [d, 0]));
  const acumDia = new Map();
  const fechas = filtrados.map((r) => r.fecha).filter(Boolean);
  if (mesesBase.length) {
    const anio = Number((fechas[0] || "2026").slice(0, 4));
    const desde = new Date(anio, mesesBase[0][1] - 1, 1);
    const hasta = new Date(anio, mesesBase[mesesBase.length - 1][1], 0);
    for (const d = new Date(desde); d <= hasta; d.setDate(d.getDate() + 1)) {
      vecesPorDia[DIAS_SEMANA[(d.getDay() + 6) % 7]] += 1;
    }
  }
  filtrados.forEach((r) => {
    if (!r.fecha) return;
    const [y, m, d] = r.fecha.split("-").map(Number);
    const nombre = DIAS_SEMANA[(new Date(y, m - 1, d).getDay() + 6) % 7];
    acumDia.set(nombre, (acumDia.get(nombre) || 0) + 1);
  });
  const porDiaSemana = DIAS_SEMANA.map((d) => ({
    name: d,
    total: acumDia.get(d) || 0,
    dias: vecesPorDia[d] || 0,
    value: vecesPorDia[d] ? +((acumDia.get(d) || 0) / vecesPorDia[d]).toFixed(2) : 0,
  }));

  // --- Puntos por cámara, con clase y persistencia ---
  const { puntos, cortes, clasificacionUtil } = clasificarPuntos(
    filtrados,
    mesesObservados,
    persistenciaMinima
  );

  const ultimo = porMes[porMes.length - 1]?.value ?? 0;
  const previo = porMes[porMes.length - 2]?.value ?? 0;

  // Subcategoría dominante: lo más cercano a un "% con lesiones" que se puede
  // dar de forma genérica, porque en el resto de las categorías la subcategoría
  // describe el tipo y no la gravedad.
  const acumSub = new Map();
  filtrados.forEach((r) => {
    const s = r.subcategoria;
    if (s) acumSub.set(s, (acumSub.get(s) || 0) + 1);
  });
  const subTop = Array.from(acumSub.entries()).sort((a, b) => b[1] - a[1])[0] || null;

  return {
    categoria: categoria || "Todas las categorías",
    kpis: {
      total: filtrados.length,
      promedioDiario: diasPeriodo ? +(filtrados.length / diasPeriodo).toFixed(2) : 0,
      variacionUltimoMes: previo ? +(((ultimo - previo) / previo) * 100).toFixed(2) : null,
      diasPeriodo,
      camaras: puntos.length,
      subTop: subTop ? { name: subTop[0], value: subTop[1] } : null,
    },
    porMes,
    porDiaSemana,
    puntos,
    cortes,
    clasificacionUtil,
    mesesObservados,
    persistenciaMinima,
    resumen: resumenRecurrencia(puntos),
  };
}

function resumenRecurrencia(puntos) {
  const cuenta = (campo, valor) => puntos.filter((p) => p[campo] === valor).length;
  const conPrioridad = puntos.filter((p) => p.prioridad !== "SIN PRIORIDAD");
  return {
    puntos: puntos.length,
    svTotales: puntos.reduce((s, p) => s + p.svAcumulados, 0),
    porColor: COLORES_RECURRENCIA.map((c) => ({ name: c, value: cuenta("color", c) })),
    porClase: CLASES_RECURRENCIA.map((c) => ({ name: c, value: cuenta("clase", c) })),
    prioridad1: cuenta("prioridad", "PRIORIDAD 1"),
    prioridad2: cuenta("prioridad", "PRIORIDAD 2"),
    priorizados: conPrioridad.length,
  };
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

// ---------------------------------------------------------------------------
// Indicadores del dashboard de siniestralidad vial (hoja "Hoja1" del Excel del
// COMM: una fila por siniestro detectado).
//
// Todo se calcula acá, pero los números están verificados contra el dashboard
// que el COMM ya armó en Excel: 498 detectados, 2,35 diarios, -11,34% de
// variación, 50,6% con lesiones, y las mismas franjas horarias.
// ---------------------------------------------------------------------------

const DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

// Franjas horarias tal como las define el dashboard del COMM.
const FRANJAS = [
  { name: "Madrugada", detalle: "00:00–03:59", desde: 0, hasta: 3 },
  { name: "Mañana temprana", detalle: "04:00–07:59", desde: 4, hasta: 7 },
  { name: "Mañana", detalle: "08:00–11:59", desde: 8, hasta: 11 },
  { name: "Mediodía / primera tarde", detalle: "12:00–15:59", desde: 12, hasta: 15 },
  { name: "Tarde", detalle: "16:00–19:59", desde: 16, hasta: 19 },
  { name: "Noche", detalle: "20:00–23:59", desde: 20, hasta: 23 },
];

const DIAS_POR_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function esBisiesto(anio) {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function loadIndicadoresSV(filePath, anio = 2026) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró el Excel de siniestralidad en: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const hoja = findSheetName(wb, { exact: ["Hoja1"], contains: ["hoja1"] });
  if (!hoja) return null; // el Excel viejo solo traía Hoja2: la vista degrada sin romperse

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: "" });
  if (!rows.length) return null;

  const headers = Object.keys(rows[0]);
  const colMes = pickColumn(headers, ["mes"]);
  const colSub = pickColumn(headers, ["subcategoria", "subcategoría"]);
  const colDia = pickColumn(headers, ["día de semana", "dia de semana"]);
  const colHora = pickColumn(headers, ["hora corregida", "hora"]);
  const colUbic = pickColumn(headers, ["ubicación", "ubicacion"]);

  const norm = (v) => String(v ?? "").trim().toLowerCase();

  // --- Evolución mensual, en orden calendario ---
  const acumMes = new Map();
  rows.forEach((r) => {
    const m = norm(r[colMes]);
    if (m) acumMes.set(m, (acumMes.get(m) || 0) + 1);
  });
  const porMesSV = MESES_ES.map((m, i) => ({ name: m, mesnro: i + 1, value: acumMes.get(m) || 0 }))
    .filter((m) => acumMes.has(m.name));

  // Días del período: se suman los meses efectivamente presentes, que es como
  // el COMM calcula el promedio diario (498 / 212 = 2,35).
  const diasPeriodo = porMesSV.reduce((acc, m) => {
    const d = DIAS_POR_MES[m.mesnro - 1];
    return acc + (m.mesnro === 2 && esBisiesto(anio) ? d + 1 : d);
  }, 0);

  // --- Promedio por día de la semana ---
  // Divide por cuántas veces cayó ese día en el período, no por 7: enero-julio
  // 2026 tiene 31 jueves y viernes pero 30 del resto, y eso mueve el promedio.
  const vecesPorDia = Object.fromEntries(DIAS_SEMANA.map((d) => [d, 0]));
  if (porMesSV.length) {
    const desde = new Date(anio, porMesSV[0].mesnro - 1, 1);
    const hasta = new Date(anio, porMesSV[porMesSV.length - 1].mesnro, 0);
    for (const d = new Date(desde); d <= hasta; d.setDate(d.getDate() + 1)) {
      vecesPorDia[DIAS_SEMANA[(d.getDay() + 6) % 7]] += 1;
    }
  }
  const acumDia = new Map();
  rows.forEach((r) => {
    const d = norm(r[colDia]);
    if (d) acumDia.set(d, (acumDia.get(d) || 0) + 1);
  });
  const porDiaSemana = DIAS_SEMANA.map((d) => ({
    name: d,
    total: acumDia.get(d) || 0,
    dias: vecesPorDia[d] || 0,
    value: vecesPorDia[d] ? +((acumDia.get(d) || 0) / vecesPorDia[d]).toFixed(2) : 0,
  }));

  // --- Franja horaria ---
  // Solo una parte de los registros tiene hora cargada (el resto viene "NC"),
  // así que el porcentaje se calcula sobre ese subconjunto y se informa de qué
  // meses sale, para no dar a entender que cubre todo el período.
  const conHora = rows.filter((r) => Number.isFinite(Number(r[colHora])));
  const acumFranja = new Map();
  conHora.forEach((r) => {
    const h = Number(r[colHora]);
    const f = FRANJAS.find((x) => h >= x.desde && h <= x.hasta);
    if (f) acumFranja.set(f.name, (acumFranja.get(f.name) || 0) + 1);
  });
  const porFranja = FRANJAS.map((f) => ({
    name: f.name,
    detalle: f.detalle,
    total: acumFranja.get(f.name) || 0,
    value: conHora.length ? +(((acumFranja.get(f.name) || 0) / conHora.length) * 100).toFixed(1) : 0,
  }));
  const mesesConHora = MESES_ES.filter((m) =>
    conHora.some((r) => norm(r[colMes]) === m)
  );

  // El ranking de puntos NO se calcula acá: el gráfico del COMM sale de la hoja
  // "Selección Piloto", que son los 16 candidatos (prioridad 1 y 2). Filtrar por
  // "4 o más acumulados" daría 31 puntos, porque 15 llegan a 4 siniestros pero
  // no alcanzan el 50% de persistencia. Se arma desde los puntos de recurrencia.

  const conLesiones = rows.filter((r) => norm(r[colSub]).includes("con lesiones")).length;
  const ultimo = porMesSV[porMesSV.length - 1]?.value ?? 0;
  const previo = porMesSV[porMesSV.length - 2]?.value ?? 0;

  return {
    kpis: {
      total: rows.length,
      promedioDiario: diasPeriodo ? +(rows.length / diasPeriodo).toFixed(2) : 0,
      variacionUltimoMes: previo ? +(((ultimo - previo) / previo) * 100).toFixed(2) : null,
      pctConLesiones: rows.length ? +((conLesiones / rows.length) * 100).toFixed(1) : 0,
      conLesiones,
      diasPeriodo,
    },
    porMes: porMesSV,
    porDiaSemana,
    porFranja,
    franjaMeses: mesesConHora,
    franjaRegistros: conHora.length,

    meta: { hoja, filas: rows.length, anio },
  };
}

module.exports = {
  loadIndicadoresSV,
  analizarCategoria,
  clasificarPuntos,
  loadIncidents,
  applyFilters,
  countBy,
  porMes,
  rankingPuntos,
  buildKpis,
  buildFilterOptions,
  buildMapPoints,
  loadRecurrencia,
  opcionesRecurrencia,
  filtrarRecurrencia,
  resumenRecurrencia,
};
