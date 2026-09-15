// areas.js — registro de las áreas (casos de estudio) de la Subsecretaría de
// Seguridad Ciudadana.
//
// El tablero nació atado al COMM. Este registro es el punto donde se declara
// cada área con su fuente de datos, para que sumar Defensa Civil o la Patrulla
// no implique tocar la lógica: alcanza con agregar la entrada y su Excel.
//
// `disponible` NO se declara a mano: se calcula mirando si el archivo existe.
// Así la pantalla de inicio dice la verdad sobre qué hay cargado.

const path = require("path");
const fs = require("fs");

// Dónde viven los assets del cliente. Se miran los dos porque en desarrollo los
// sirve Vite desde public/ y en el host salen del build.
const DIRS_PUBLICOS = [
  path.join(__dirname, "..", "client", "public"),
  process.env.CLIENT_DIST || path.join(__dirname, "..", "client", "dist"),
];

// El escudo de cada área se informa solo si el archivo existe de verdad. Así
// alcanza con dejar el PNG en client/public/ para que aparezca, igual que pasa
// con el Excel, y mientras tanto la tarjeta usa la sigla sin pedir un 404.
function rutaLogo(archivo) {
  if (!archivo) return null;
  return DIRS_PUBLICOS.some((d) => fs.existsSync(path.join(d, archivo)))
    ? `/${archivo}`
    : null;
}

const AREAS = [
  {
    id: "comm",
    sigla: "COMM",
    nombre: "Centro Operativo de Monitoreo Municipal",
    descripcion:
      "Incidentes detectados por las cámaras del anillo de monitoreo. " +
      "Incluye el análisis de recurrencia territorial de siniestros viales.",
    archivo: "incidentes.xlsx",
    // Fuente complementaria: la planilla de recurrencia ya clasificada.
    archivoExtra: "siniestralidad.xlsx",
  },
  {
    id: "defensa-civil",
    sigla: "DC",
    nombre: "Defensa Civil",
    descripcion:
      "Denuncias del libro de guardia por categoría y organismo derivado. " +
      "La fuente es el resumen mensual, ya agregado, así que no lleva mapa.",
    archivo: "defensa-civil.xlsx",
    logoArchivo: "logo-dc.png",
  },
  {
    id: "ppc",
    sigla: "PPC",
    nombre: "Patrulla de Protección Ciudadana",
    descripcion:
      "Intervenciones de la Patrulla por tipo y por mes. La base viene agregada " +
      "(sin domicilio ni coordenadas), así que esta vista no lleva mapa.",
    archivo: "ppc.xlsx",
    logoArchivo: "logo-ppc.png",
  },
];

// Estado de cada área según lo que haya realmente en el directorio de datos.
function listarAreas(dataDir) {
  return AREAS.map((a) => {
    const ruta = path.join(dataDir, a.archivo);
    const existe = fs.existsSync(ruta);
    return {
      id: a.id,
      sigla: a.sigla,
      nombre: a.nombre,
      descripcion: a.descripcion,
      logo: rutaLogo(a.logoArchivo),
      disponible: existe,
      archivo: a.archivo,
      // Solo informativo para la vista de gestión de datos.
      tamanioBytes: existe ? fs.statSync(ruta).size : null,
    };
  });
}

function buscarArea(id) {
  return AREAS.find((a) => a.id === id) || null;
}

module.exports = { AREAS, listarAreas, buscarArea };
