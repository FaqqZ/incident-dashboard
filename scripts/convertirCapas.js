// convertirCapas.js — prepara las capas territoriales del mapa del COMM.
//
// Uso: node scripts/convertirCapas.js <distritos> <circuitos> <barrios>
// Escribe client/public/capas/{distritos,circuitos,barrios}.geojson
//
// Qué hace y por qué:
//   · Reproyecta a WGS84 (lat/lng, lo que usa Leaflet). Circuitos y barrios
//     llegaron en EPSG:5345 (POSGAR 2007 / Argentina faja 3, en metros);
//     Leaflet los dibujaría en otro lado del planeta. Distritos ya venía en
//     CRS84 y pasa sin reproyectar.
//   · Aplana los GeometryCollection a MultiPolygon y tira las líneas
//     degeneradas que traen adentro (Distrito 17 tiene una de dos puntos
//     iguales). Así el cliente solo recibe polígonos.
//   · Redondea a 6 decimales (~10 cm) y deja solo las propiedades que muestra
//     el mapa: el archivo de barrios baja a la mitad.
//
// Sin dependencias: la inversa de Transversal Mercator es la de Snyder
// (USGS PP 1395, §8), exacta al milímetro a menos de 1° del meridiano central
// (Tucumán está a 0,8° del -66).

const fs = require("fs");
const path = require("path");

const SALIDA = path.join(__dirname, "..", "client", "public", "capas");

// GRS80 — el elipsoide de POSGAR 2007.
const A = 6378137;
const F = 1 / 298.257222101;
const E2 = 2 * F - F * F;
const EP2 = E2 / (1 - E2);

// Parámetros de cada CRS proyectado que puede traer una capa.
const PROYECCIONES = {
  5343: { lon0: -72, x0: 1500000 },
  5344: { lon0: -69, x0: 2500000 },
  5345: { lon0: -66, x0: 3500000 },
  5346: { lon0: -63, x0: 4500000 },
};

const rad = (g) => (g * Math.PI) / 180;
const grd = (r) => (r * 180) / Math.PI;

// Arco de meridiano desde el ecuador hasta la latitud phi.
function arcoMeridiano(phi) {
  const e4 = E2 * E2;
  const e6 = e4 * E2;
  return A * (
    (1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
    ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
    ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
    ((35 * e6) / 3072) * Math.sin(6 * phi)
  );
}

// Las fajas argentinas tienen el origen de latitudes en el polo sur (lat0 = -90).
function inversaTM(x, y, { lon0, x0 }) {
  const M = arcoMeridiano(rad(-90)) + y;
  const mu = M / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const s = Math.sin(phi1);
  const c = Math.cos(phi1);
  const t = Math.tan(phi1);
  const C1 = EP2 * c * c;
  const T1 = t * t;
  const N1 = A / Math.sqrt(1 - E2 * s * s);
  const R1 = (A * (1 - E2)) / (1 - E2 * s * s) ** 1.5;
  const D = (x - x0) / N1;

  const lat =
    phi1 -
    ((N1 * t) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * EP2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * EP2 - 3 * C1 ** 2) * D ** 6) / 720);
  const lon =
    rad(lon0) +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * EP2 + 24 * T1 ** 2) * D ** 5) / 120) /
      c;
  return [grd(lon), grd(lat)];
}

function epsgDe(geo) {
  const nombre = geo.crs?.properties?.name || "";
  if (!nombre || /CRS84|EPSG::4326/.test(nombre)) return null;
  const m = nombre.match(/EPSG::(\d+)/);
  if (!m || !PROYECCIONES[m[1]]) throw new Error(`CRS no soportado: ${nombre}`);
  return PROYECCIONES[m[1]];
}

const r6 = (v) => Math.round(v * 1e6) / 1e6;

// Devuelve la lista de polígonos de la geometría (sin líneas ni puntos).
function poligonos(g) {
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  if (g.type === "GeometryCollection") return g.geometries.flatMap(poligonos);
  return [];
}

function convertir(entrada, campos) {
  const geo = JSON.parse(fs.readFileSync(entrada, "utf8"));
  const proy = epsgDe(geo);
  const punto = proy
    ? ([x, y]) => inversaTM(x, y, proy).map(r6)
    : ([lon, lat]) => [r6(lon), r6(lat)];

  let descartadas = 0;
  const features = geo.features
    .map((f) => {
      const polys = poligonos(f.geometry).map((p) => p.map((anillo) => anillo.map(punto)));
      if (!polys.length) {
        descartadas++;
        return null;
      }
      return {
        type: "Feature",
        properties: campos(f.properties),
        geometry: { type: "MultiPolygon", coordinates: polys },
      };
    })
    .filter(Boolean);

  return { geo: { type: "FeatureCollection", features }, descartadas, proy };
}

const limpio = (v) => (typeof v === "string" ? v.trim() : v) || null;

// Campos que usa el mapa de cada capa. `nombre` es lo que va en el tooltip.
const CAPAS = {
  distritos: (p) => ({ nombre: limpio(p.DISTRITO), id: p["ID DISTRIT"] }),
  circuitos: (p) => ({
    nombre: limpio(p.NUMERO_CIR) && `Circuito ${limpio(p.NUMERO_CIR)}`,
    id: p["ID CIRCUIT"],
  }),
  barrios: (p) => ({
    nombre: limpio(p.NOMBRE),
    id: p.ID_BARRIO,
    // "zona elene white sur", "zona" y los vacíos se normalizan: el tooltip
    // solo distingue Barrio de Zona.
    tipo: /^zona/i.test(p.TIPO || "") ? "Zona" : p.TIPO ? "Barrio" : null,
    distrito: limpio(p.DISTRITO),
    circuito: limpio(p.CIRCUITO_ELECTORAL),
    hectareas: p.AREA_HA ?? null,
  }),
};

const [, , ...archivos] = process.argv;
if (archivos.length !== 3) {
  console.error("uso: node scripts/convertirCapas.js <distritos> <circuitos> <barrios>");
  process.exit(2);
}

fs.mkdirSync(SALIDA, { recursive: true });
Object.keys(CAPAS).forEach((clave, i) => {
  const { geo, descartadas, proy } = convertir(archivos[i], CAPAS[clave]);
  const destino = path.join(SALIDA, `${clave}.geojson`);
  fs.writeFileSync(destino, JSON.stringify(geo));
  const todas = geo.features.flatMap((f) => f.geometry.coordinates.flat(2));
  const lons = todas.map((c) => c[0]);
  const lats = todas.map((c) => c[1]);
  console.log(
    `${clave}: ${geo.features.length} polígonos` +
      (descartadas ? `, ${descartadas} sin geometría` : "") +
      ` · ${proy ? `reproyectado desde faja lon0=${proy.lon0}` : "ya en WGS84"}` +
      ` · lon ${Math.min(...lons).toFixed(4)}…${Math.max(...lons).toFixed(4)}` +
      ` lat ${Math.min(...lats).toFixed(4)}…${Math.max(...lats).toFixed(4)}` +
      ` · ${(fs.statSync(destino).size / 1024).toFixed(0)} KB`
  );
});
