// index.js — API Express. Lee el Excel (dos hojas) una vez, lo mantiene en
// memoria y sirve datos ya agregados y filtrados. El Excel no sale del servidor.

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const R = require("./excelReader");

const app = express();
const PORT = process.env.PORT || 4000;
const DATA_DIR = path.join(__dirname, "data");

// En serverless (Vercel) el cwd y el __dirname no siempre coinciden con el
// layout local, así que se prueban varias ubicaciones antes de rendirse.
function resolveExcelPath() {
  if (process.env.EXCEL_PATH) return process.env.EXCEL_PATH;
  const candidatos = [
    path.join(DATA_DIR, "incidentes.xlsx"),
    path.join(process.cwd(), "server", "data", "incidentes.xlsx"),
    path.join(process.cwd(), "data", "incidentes.xlsx"),
  ];
  return candidatos.find((p) => fs.existsSync(p)) || candidatos[0];
}

const EXCEL_PATH = resolveExcelPath();

// Vercel monta un filesystem de solo lectura: no se puede reemplazar el Excel
// en caliente. La carga mensual queda deshabilitada allá.
const ES_SERVERLESS = Boolean(process.env.VERCEL);

app.use(cors());
app.use(express.json());

let state = { records: [], meta: {}, loadedAt: null, error: null };

// Recurrencia territorial de siniestros viales (COMM): archivo aparte, con la
// clasificación ya calculada en Excel. Si falta, el resto del tablero sigue
// funcionando y solo esa vista avisa del problema.
const SINIESTRALIDAD_PATH =
  process.env.SINIESTRALIDAD_PATH || path.join(DATA_DIR, "siniestralidad.xlsx");

let recurrencia = { puntos: [], meta: {}, loadedAt: null, error: null };
let indicadoresSV = { datos: null, loadedAt: null, error: null };

function reload() {
  let cameras = null;
  try {
    const cargado = R.loadIncidents(EXCEL_PATH);
    cameras = cargado.cameras;
    state = {
      records: cargado.records,
      meta: cargado.meta,
      loadedAt: new Date().toISOString(),
      error: null,
    };
    console.log(
      `[data] ${cargado.records.length} incidentes | hoja "${cargado.meta.hojaIncidentes}" + ` +
        `"${cargado.meta.hojaCamaras}" | ${cargado.meta.incidentesSinCamara} sin cámara`
    );
  } catch (err) {
    state = { records: [], meta: {}, loadedAt: null, error: err.message };
    console.error("[data] Error al cargar el Excel:", err.message);
  }

  try {
    if (!cameras) throw new Error("Sin base de cámaras: no se pueden ubicar los puntos");
    const { puntos, meta } = R.loadRecurrencia(SINIESTRALIDAD_PATH, cameras);
    recurrencia = { puntos, meta, loadedAt: new Date().toISOString(), error: null };
    console.log(
      `[recurrencia] ${puntos.length} puntos | hoja "${meta.hoja}" | ` +
        `${meta.svTotales} siniestros | ${meta.sinCoordenadas} sin coordenadas`
    );
  } catch (err) {
    recurrencia = { puntos: [], meta: {}, loadedAt: null, error: err.message };
    console.error("[recurrencia] Error al cargar el Excel:", err.message);
  }

  try {
    const ind = R.loadIndicadoresSV(SINIESTRALIDAD_PATH);
    indicadoresSV = { datos: ind, loadedAt: new Date().toISOString(), error: null };
    console.log(
      ind
        ? `[indicadores] ${ind.kpis.total} siniestros | ${ind.kpis.promedioDiario}/día | ` +
            `${ind.kpis.pctConLesiones}% con lesiones`
        : "[indicadores] el Excel no trae hoja de registros: la vista los omite"
    );
  } catch (err) {
    indicadoresSV = { datos: null, loadedAt: null, error: err.message };
    console.error("[indicadores] Error al calcular indicadores:", err.message);
  }
}
reload();

function getFilters(req) {
  const { from, to, categoria, turno, mes, clase, naturaleza } = req.query;
  return {
    from: from || null,
    to: to || null,
    categoria: categoria || null,
    turno: turno || null,
    mes: mes || null,
    clase: clase || null,
    naturaleza: naturaleza || null,
  };
}

// Salud + diagnóstico del mapeo de columnas y del cruce
app.get("/api/health", (req, res) => {
  res.json({
    ok: !state.error,
    error: state.error,
    loadedAt: state.loadedAt,
    totalRegistros: state.records.length,
    // El front lo usa para ocultar la carga de Excel cuando el deploy no
    // tiene disco de escritura (Vercel).
    cargaHabilitada: !ES_SERVERLESS,
    meta: state.meta,
  });
});

// Opciones para los slicers
app.get("/api/options", (req, res) => {
  res.json(R.buildFilterOptions(state.records));
});

// Payload principal del tablero
app.get("/api/dashboard", (req, res) => {
  if (state.error) return res.status(500).json({ error: state.error });
  const filters = getFilters(req);
  const f = R.applyFilters(state.records, filters);
  const kpis = R.buildKpis(f);
  res.json({
    filtros: filters,
    kpis,
    categoriaPrincipal: kpis.categoriaTop ? kpis.categoriaTop.name : null,
    porCategoria: R.countBy(f, "categoria"),
    porTurno: R.countBy(f, "turno"),
    porMes: R.porMes(f),
    rankingPuntos: R.rankingPuntos(f, 12),
    // Puntos ya clasificados con la metodología del COMM (P75/P90/P95 sobre lo
    // FILTRADO). El mapa del tablero dibuja puntos discretos por clase, igual
    // que el de siniestros viales, en vez de una mancha de calor.
    ...(() => {
      const meses = new Set(state.records.filter((r) => r.mes).map((r) => r.mes)).size || 1;
      const { puntos, cortes, clasificacionUtil } = R.clasificarPuntos(f, meses);
      return { puntos, cortes, clasificacionUtil, mesesObservados: meses };
    })(),
    totalFiltrado: f.length,
  });
});

// --- Recurrencia territorial de siniestros viales (COMM) ---
// La clasificación viene calculada desde Excel: acá NO se recalculan
// percentiles ni clases, solo se filtra y se sirve.
app.get("/api/recurrencia", (req, res) => {
  if (recurrencia.error) return res.status(500).json({ error: recurrencia.error });
  const filtros = {
    clase: req.query.clase || null,
    color: req.query.color || null,
    prioridad: req.query.prioridad || null,
  };
  const filtrados = R.filtrarRecurrencia(recurrencia.puntos, filtros);
  res.json({
    filtros,
    puntos: filtrados,
    resumen: R.resumenRecurrencia(filtrados),
    totalSinFiltrar: recurrencia.puntos.length,
    periodo: "Acumulado enero–julio de 2026",
    meta: recurrencia.meta,
    loadedAt: recurrencia.loadedAt,
  });
});

// Análisis por categoría: la misma metodología del COMM aplicada a cualquier
// categoría de la base de incidentes. Sin franja horaria (ver excelReader).
app.get("/api/categoria/analisis", (req, res) => {
  if (state.error) return res.status(500).json({ error: state.error });
  const categoria = req.query.categoria || null;
  if (categoria && !state.records.some((r) => r.categoria === categoria)) {
    return res.status(404).json({ error: `No hay incidentes de la categoría "${categoria}"` });
  }
  res.json(R.analizarCategoria(state.records, categoria));
});

// Indicadores descriptivos de siniestralidad vial. Son del período completo y
// no se filtran: replican el dashboard que el COMM ya tiene en Excel.
app.get("/api/siniestros/indicadores", (req, res) => {
  if (indicadoresSV.error) return res.status(500).json({ error: indicadoresSV.error });
  if (!indicadoresSV.datos) {
    return res.status(404).json({ error: "El Excel cargado no trae la hoja de registros" });
  }
  res.json({ ...indicadoresSV.datos, loadedAt: indicadoresSV.loadedAt });
});

app.get("/api/recurrencia/options", (req, res) => {
  if (recurrencia.error) return res.status(500).json({ error: recurrencia.error });
  res.json(R.opcionesRecurrencia(recurrencia.puntos));
});

// --- Carga de un nuevo Excel (actualización mensual) ---
// memoryStorage, NO `dest`: multer con `dest` construye un DiskStorage que hace
// mkdir del directorio en el momento de crearse, no al recibir el archivo. En un
// filesystem de solo lectura (Vercel) eso tira EROFS al importar el módulo y
// tumba la función entera, dejando TODA la API en 500. Con el buffer en memoria
// no se toca el disco hasta que hay algo que guardar.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls)$/i.test(file.originalname);
    cb(ok ? null : new Error("Subí un .xlsx o .xls"), ok);
  },
});

function rechazarSiServerless(req, res, next) {
  if (!ES_SERVERLESS) return next();
  return res.status(501).json({
    error:
      "La carga de Excel no está disponible en el deploy de Vercel: el disco es " +
      "de solo lectura. El Excel viaja dentro del deploy; para actualizarlo, " +
      "reemplazá server/data/incidentes.xlsx y volvé a desplegar.",
  });
}

function requireUploadToken(req, res, next) {
  const token = process.env.UPLOAD_TOKEN;
  if (!token) return next();
  if (req.headers["x-upload-token"] === token) return next();
  return res.status(401).json({ error: "Token de carga inválido" });
}

app.post("/api/upload", rechazarSiServerless, requireUploadToken, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo" });
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(EXCEL_PATH, req.file.buffer);
    reload();
    if (state.error) return res.status(400).json({ error: state.error });
    res.json({ ok: true, totalRegistros: state.records.length, meta: state.meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vacía la base de incidentes. Pide una confirmación escrita en el cuerpo para
// que un POST suelto —un reintento, un curl de prueba— no pueda borrar nada.
// Siempre deja un respaldo con fecha en server/data/backups/.
app.post("/api/limpiar", rechazarSiServerless, requireUploadToken, (req, res) => {
  if (req.body?.confirmacion !== "LIMPIAR") {
    return res.status(400).json({
      error: 'Falta la confirmación: se espera {"confirmacion":"LIMPIAR"} en el cuerpo.',
    });
  }
  try {
    const info = R.vaciarIncidentes(EXCEL_PATH, path.join(DATA_DIR, "backups"));
    reload();
    if (state.error) return res.status(500).json({ error: state.error });
    res.json({ ok: true, ...info, totalRegistros: state.records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/reload", requireUploadToken, (req, res) => {
  reload();
  res.json({ ok: !state.error, error: state.error, totalRegistros: state.records.length });
});

// Solo levanta el puerto si se ejecuta directamente (npm start). En Vercel el
// módulo se importa desde api/[...path].js y la app se usa como handler.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Dashboard API en http://localhost:${PORT}`);
    console.log(`  Excel esperado en: ${EXCEL_PATH}\n`);
  });
}

module.exports = app;
