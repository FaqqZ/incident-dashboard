// generateSample.js
// Genera un Excel de ejemplo con la MISMA estructura que tu archivo real:
//   Hoja "bd": incidentes con columna "dispositivo" (referencia a la cámara)
//   Hoja "coordenadas-cam-actualizado": cámaras con id, DIRECCION, COORDENADAS
// Sirve solo para probar la app antes de enchufar tu Excel real.
// Ejecutar: npm run sample

const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const CATEGORIAS = [
  "Siniestros Viales", "911", "Post Siniestros Viales",
  "Personas", "Totems", "Violencia",
];
const TURNOS = ["mañana", "tarde", "noche", "intermedio"];
const CALLES = [
  "AV. Benjamín Aráoz", "AV. Sarmiento", "AV. Mate de Luna", "San Martín",
  "AV. Aconquija", "Marcos Paz", "AV. Roca", "Chacabuco", "Muñecas", "Corrientes",
];
const CENTRO = { lat: -26.8241, lng: -65.2226 };

function rand(a) { return a[Math.floor(Math.random() * a.length)]; }
function jitter(base, spread) { return base + (Math.random() - 0.5) * spread; }
function pad(n, l) { return String(n).padStart(l, "0"); }

// --- Hoja de cámaras: 60 cámaras DOM + 20 CAM ---
const camaras = [];
for (let i = 1; i <= 60; i++) {
  camaras.push({
    id: `DOM${pad(i, 3)}`,
    DIRECCION: `${rand(CALLES)} ${100 + Math.floor(Math.random() * 900)}`,
    COORDENADAS: `${jitter(CENTRO.lat, 0.08).toFixed(6)}, ${jitter(CENTRO.lng, 0.08).toFixed(6)}`,
  });
}
for (let i = 1; i <= 20; i++) {
  camaras.push({
    id: `CAM${pad(i, 3)}`,
    DIRECCION: `${rand(CALLES)} ${100 + Math.floor(Math.random() * 900)}`,
    COORDENADAS: `${jitter(CENTRO.lat, 0.08).toFixed(6)}, ${jitter(CENTRO.lng, 0.08).toFixed(6)}`,
  });
}
// Simula el id que en la vida real venía mal escrito ("DO-001" -> se corrige a "DOM001")
camaras[0].id = "DO-001";

const idsValidos = camaras.map((c) => (c.id === "DO-001" ? "DOM001" : c.id));

// --- Hoja bd: ~2000 incidentes, algunas filas vacías al final ---
function randomDate() {
  const start = new Date(2026, 0, 1).getTime();
  const end = new Date(2026, 6, 20).getTime(); // hasta mediados de julio (parcial)
  const t = start + Math.random() * (end - start);
  const d = new Date(t);
  return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()}`;
}

const bd = [];
// pesos para que "Siniestros Viales" y "911" dominen, como en tu base real
const CAT_POOL = [
  ...Array(30).fill("Siniestros Viales"),
  ...Array(28).fill("911"),
  ...Array(12).fill("Post Siniestros Viales"),
  ...Array(8).fill("Personas"),
  ...Array(7).fill("Totems"),
  ...Array(7).fill("Violencia"),
];
for (let i = 0; i < 2009; i++) {
  bd.push({
    fecha: randomDate(),
    dispositivo: rand(idsValidos),
    categoria: rand(CAT_POOL),
    turno: rand([...Array(4).fill("tarde"), ...Array(3).fill("noche"), ...Array(3).fill("mañana"), "intermedio"]),
  });
}
// filas vacías (para probar el filtro de dispositivo nulo)
for (let i = 0; i < 15; i++) bd.push({ fecha: "", dispositivo: "", categoria: "", turno: "" });

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bd), "bd");
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.json_to_sheet(camaras),
  "coordenadas-cam-actualizado"
);

const outDir = path.join(__dirname, "data");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "incidentes.xlsx");
XLSX.writeFile(wb, outPath);

console.log(`Excel de ejemplo generado: ${outPath}`);
console.log(`  Hoja bd: ${bd.length} filas (${bd.length - 15} reales + 15 vacías)`);
console.log(`  Hoja coordenadas-cam-actualizado: ${camaras.length} cámaras`);
