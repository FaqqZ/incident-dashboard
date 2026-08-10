// Entrada serverless de Vercel. Captura todo /api/* y se lo pasa a la misma
// app Express que corre local, así no hay dos implementaciones de la API.
// El nombre [...path] es una ruta catch-all: sin eso, /api/dashboard no llega.

module.exports = require("../server/index.js");
