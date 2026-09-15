// index.js — API Express. Lee el Excel (dos hojas) una vez, lo mantiene en
// memoria y sirve datos ya agregados y filtrados. El Excel no sale del servidor.

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const R = require("./excelReader");
const PPC = require("./ppcReader");
const DC = require("./dcReader");
const { listarAreas } = require("./areas");

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0"; // en contenedor hay que escuchar en todas

// DATA_DIR es el directorio de trabajo: en el host se monta ahí el disco
// persistente, para que la carga mensual sobreviva a los redespliegues.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

// SEED_DIR viaja dentro de la imagen y NUNCA se escribe. Si el volumen arranca
// vacío (primer despliegue, disco nuevo) se copia desde acá: montar un volumen
// sobre data/ taparía los archivos incluidos en la imagen y el tablero
// arrancaría sin datos.
const SEED_DIR = process.env.SEED_DIR || path.join(__dirname, "seed");

function sembrarSiFalta() {
  if (!fs.existsSync(SEED_DIR)) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const archivo of fs.readdirSync(SEED_DIR)) {
    const destino = path.join(DATA_DIR, archivo);
    if (fs.existsSync(destino)) continue;
    fs.copyFileSync(path.join(SEED_DIR, archivo), destino);
    console.log(`[seed] ${archivo} copiado a ${DATA_DIR}`);
  }
}

// En serverless (Vercel) el disco es de solo lectura: no se puede sembrar.
if (!process.env.VERCEL) {
  try {
    sembrarSiFalta();
  } catch (err) {
    console.error("[seed] No se pudo sembrar el directorio de datos:", err.message);
  }
}

// En serverless el cwd y el __dirname no siempre coinciden con el layout local,
// así que se prueban varias ubicaciones antes de rendirse.
function resolveExcelPath() {
  if (process.env.EXCEL_PATH) return process.env.EXCEL_PATH;
  const candidatos = [
    path.join(DATA_DIR, "incidentes.xlsx"),
    path.join(SEED_DIR, "incidentes.xlsx"),
    path.join(process.cwd(), "server", "seed", "incidentes.xlsx"),
    path.join(process.cwd(), "server", "data", "incidentes.xlsx"),
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
  process.env.SINIESTRALIDAD_PATH ||
  [path.join(DATA_DIR, "siniestralidad.xlsx"), path.join(SEED_DIR, "siniestralidad.xlsx")].find(
    (p) => fs.existsSync(p)
  ) ||
  path.join(DATA_DIR, "siniestralidad.xlsx");

let recurrencia = { puntos: [], meta: {}, loadedAt: null, error: null };
let indicadoresSV = { datos: null, loadedAt: null, error: null };

// Patrulla de Protección Ciudadana: base propia, con forma de matriz mensual.
// Vive aparte del COMM porque no comparte ni el modelo ni las medidas.
const PPC_PATH =
  process.env.PPC_PATH ||
  [path.join(DATA_DIR, "ppc.xlsx"), path.join(SEED_DIR, "ppc.xlsx")].find((p) =>
    fs.existsSync(p)
  ) ||
  path.join(DATA_DIR, "ppc.xlsx");

let ppc = { datos: null, loadedAt: null, error: null };

// Defensa Civil: lee la hoja de resumen mensual, no el volcado del libro de
// guardia (ver dcReader.js).
const DC_PATH =
  process.env.DC_PATH ||
  [path.join(DATA_DIR, "defensa-civil.xlsx"), path.join(SEED_DIR, "defensa-civil.xlsx")].find((p) =>
    fs.existsSync(p)
  ) ||
  path.join(DATA_DIR, "defensa-civil.xlsx");

let dc = { datos: null, loadedAt: null, error: null };

function reloadDC() {
  try {
    const datos = DC.loadDC(DC_PATH);
    dc = { datos, loadedAt: new Date().toISOString(), error: null };
    const m = datos.meta;
    console.log(
      `[dc] ${m.totalNeto} denuncias netas + ${m.totalInterno} de registro interno ` +
        `= ${m.totalNeto + m.totalInterno} | ${m.mesesObservados} meses (${m.periodo}) | ` +
        `${m.categoriasDetectadas} categorías, ${m.organismosDetectados} organismos | ` +
        `cuadra: ${m.netoCuadra && m.totalCuadra ? "sí" : "NO"}`
    );
    if (m.mesesEnConflicto.length) {
      console.warn(
        `[dc] ⚠️ las dos matrices rotulan distinto la misma columna: ` +
          m.mesesEnConflicto
            .map((c) => `posición ${c.posicion} = "${c.categorias}" / "${c.derivaciones}"`)
            .join(", ")
      );
    }
  } catch (err) {
    dc = { datos: null, loadedAt: null, error: err.message };
    console.error("[dc] Error al cargar el Excel:", err.message);
  }
}

function reloadPPC() {
  try {
    const datos = PPC.loadPPC(PPC_PATH);
    ppc = { datos, loadedAt: new Date().toISOString(), error: null };
    console.log(
      `[ppc] ${datos.meta.total} intervenciones | ${datos.meta.mesesObservados} meses ` +
        `(${datos.meta.periodo}) | ${datos.meta.tiposDetectados} tipos | ` +
        `total ${datos.meta.totalCoincide ? "coincide" : "NO coincide"} con el Excel`
    );
  } catch (err) {
    ppc = { datos: null, loadedAt: null, error: err.message };
    console.error("[ppc] Error al cargar el Excel:", err.message);
  }
}

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

  reloadPPC();
  reloadDC();
}
reload();

function getFilters(req) {
  const { from, to, categoria, subcategoria, turno, mes, clase, naturaleza } = req.query;
  return {
    from: from || null,
    to: to || null,
    categoria: categoria || null,
    subcategoria: subcategoria || null,
    turno: turno || null,
    mes: mes || null,
    clase: clase || null,
    naturaleza: naturaleza || null,
  };
}

// Salud + diagnóstico del mapeo de columnas y del cruce
// Áreas de la Subsecretaría. La pantalla de inicio arma el selector con esto y
// marca cuáles tienen datos cargados y cuáles siguen pendientes.
app.get("/api/areas", (req, res) => {
  // Cada área informa su propio estado; las que todavía no tienen pipeline
  // quedan con listo:false y la tarjeta del selector se muestra apagada.
  const estados = {
    comm: {
      registros: state.records.length,
      error: state.error,
      listo: !state.error && state.records.length > 0,
      unidad: "incidentes",
    },
    ppc: {
      // La unidad de la PPC es el mes: el Excel viene agregado, no por hecho.
      registros: ppc.datos ? ppc.datos.meta.total : null,
      error: ppc.error,
      listo: Boolean(ppc.datos) && !ppc.error,
      unidad: "intervenciones",
    },
    "defensa-civil": {
      // El neto, no el total general: los asientos de apertura y cierre de
      // guardia no son denuncias (ver dcReader.js).
      registros: dc.datos ? dc.datos.meta.totalNeto : null,
      error: dc.error,
      listo: Boolean(dc.datos) && !dc.error,
      unidad: "denuncias",
    },
  };
  const areas = listarAreas(DATA_DIR).map((a) => ({
    ...a,
    ...(estados[a.id] || { registros: null, error: null, listo: false, unidad: null }),
  }));
  res.json({ areas });
});

// --- Patrulla de Protección Ciudadana ---
// Sin mapa: la base no trae domicilio ni coordenadas, solo totales por mes y
// tipo de intervención (ver ppcReader.js).
app.get("/api/ppc", (req, res) => {
  if (ppc.error) return res.status(500).json({ error: ppc.error });
  if (!ppc.datos) return res.status(404).json({ error: "No hay base de la PPC cargada" });
  const filtros = {
    tipo: req.query.tipo || null,
    mesDesde: req.query.mesDesde || null,
    mesHasta: req.query.mesHasta || null,
  };
  res.json({ ...PPC.resumenPPC(ppc.datos, filtros), loadedAt: ppc.loadedAt });
});

app.get("/api/ppc/options", (req, res) => {
  if (ppc.error) return res.status(500).json({ error: ppc.error });
  if (!ppc.datos) return res.status(404).json({ error: "No hay base de la PPC cargada" });
  res.json(PPC.opcionesPPC(ppc.datos));
});

// --- Defensa Civil ---
// Tampoco lleva mapa: la fuente es la hoja de resumen mensual, ya agregada.
// `dimension` vale "categoria" u "organismo" y solo se puede elegir UNA: la
// planilla no permite cruzar las dos matrices (ver dcReader.js).
app.get("/api/dc", (req, res) => {
  if (dc.error) return res.status(500).json({ error: dc.error });
  if (!dc.datos) return res.status(404).json({ error: "No hay base de Defensa Civil cargada" });
  const dimension = ["categoria", "organismo"].includes(req.query.dimension)
    ? req.query.dimension
    : null;
  const filtros = {
    dimension,
    valor: (dimension && req.query.valor) || null,
    mesDesde: req.query.mesDesde || null,
    mesHasta: req.query.mesHasta || null,
  };
  res.json({ ...DC.resumenDC(dc.datos, filtros), loadedAt: dc.loadedAt });
});

app.get("/api/dc/options", (req, res) => {
  if (dc.error) return res.status(500).json({ error: dc.error });
  if (!dc.datos) return res.status(404).json({ error: "No hay base de Defensa Civil cargada" });
  res.json(DC.opcionesDC(dc.datos));
});

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
    // Desglose dentro de la categoría. Es el corte que abre "TRÁNSITO.",
    // que por sí sola concentra la mayor parte de los reportes.
    porSubcategoria: R.countBy(f, "subcategoria"),
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
    // El período sale de los meses que trae la planilla, no de un texto fijo:
    // decía "enero–julio" y quedó viejo en cuanto llegó la planilla de agosto.
    periodo: (() => {
      const meses = indicadoresSV.datos?.porMes || [];
      if (!meses.length) return "Acumulado del período de la planilla";
      const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      return `Acumulado ${cap(meses[0].name)}–${meses[meses.length - 1].name} de ${indicadoresSV.datos.meta.anio}`;
    })(),
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

// --- Frontend ---
// En el host esto corre como UN solo servicio: el mismo Express sirve la API y
// el build del cliente. En Vercel no hace falta (los estáticos los sirve la
// plataforma) y en desarrollo tampoco, porque Vite hace de proxy.
const CLIENT_DIST = process.env.CLIENT_DIST || path.join(__dirname, "..", "client", "dist");

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));

  // Fallback del SPA: /analisis, /datos y demás rutas las resuelve React Router
  // en el navegador, así que cualquier GET que no sea /api ni un archivo real
  // devuelve el index.html. Sin esto, recargar en esas rutas da 404.
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
  console.log(`[web] sirviendo el cliente desde ${CLIENT_DIST}`);
} else {
  console.log("[web] sin build del cliente: solo API (usá Vite en desarrollo)");
}

// Solo levanta el puerto si se ejecuta directamente (npm start). En Vercel el
// módulo se importa desde api/[...path].js y la app se usa como handler.
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`\n  Dashboard API en http://localhost:${PORT}`);
    console.log(`  Excel esperado en: ${EXCEL_PATH}\n`);
  });
}

module.exports = app;
