// Entrada serverless de Vercel. Toda la API pasa por esta única función: la
// reescritura "/api/(.*)" de vercel.json manda cada ruta acá, y Express la
// resuelve con la URL original, así no hay dos implementaciones de la API.
//
// Antes esto era api/[...path].js. Fuera de Next.js esa ruta comodín captura
// UN solo segmento: /api/ppc andaba, pero /api/ppc/options o
// /api/siniestros/indicadores devolvían el NOT_FOUND de Vercel.

module.exports = require("../server/index.js");
