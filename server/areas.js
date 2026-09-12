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
      "Intervenciones de Defensa Civil. Pendiente de recibir la base de datos.",
    archivo: "defensa-civil.xlsx",
  },
  {
    id: "ppc",
    sigla: "PPC",
    nombre: "Patrulla de Protección Ciudadana",
    descripcion:
      "Operativos y despachos de la Patrulla. Pendiente de recibir la base de datos.",
    archivo: "ppc.xlsx",
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
