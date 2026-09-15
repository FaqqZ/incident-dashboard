// quitarFondo.js — saca el fondo de un PNG y lo recorta al contenido.
//
// El logo llegó como JPEG de WhatsApp, que aplanó la transparencia del PNG
// original contra NEGRO. Sobre el navy del tablero eso se vería como un
// cuadrado oscuro alrededor del escudo.
//
// No hay ImageMagick ni PIL en la máquina, así que el PNG se decodifica y se
// vuelve a armar a mano con zlib (que sí viene con Node).
//
// El fondo se saca con relleno por inundación DESDE LOS BORDES, no marcando
// todo píxel oscuro: así un trazo oscuro dentro del escudo no se borra.
//
// Modo "negativo" (logo del COM): tinta negra sobre blanco. Ahí no alcanza con
// quitar el fondo —el "COM" negro no se ve sobre el navy—, así que el blanco se
// convierte en transparencia píxel a píxel y la tinta neutra pasa a blanco. Los
// colores saturados (los arcos azul y dorado) conservan su tono.

const fs = require("fs");
const zlib = require("zlib");

const [, , entrada, salida, modoArg, tolArg] = process.argv;
const modo = modoArg || "negro"; // "negro", "blanco" o "negativo"
const tolerancia = Number(tolArg || 60);

// --- decodificar -----------------------------------------------------------
const buf = fs.readFileSync(entrada);
if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("No es un PNG");

let pos = 8;
let ancho = 0, alto = 0, prof = 0, tipo = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const nombre = buf.toString("ascii", pos + 4, pos + 8);
  const datos = buf.subarray(pos + 8, pos + 8 + len);
  if (nombre === "IHDR") {
    ancho = datos.readUInt32BE(0);
    alto = datos.readUInt32BE(4);
    prof = datos[8];
    tipo = datos[9];
    if (datos[12] !== 0) throw new Error("PNG entrelazado: no soportado");
  } else if (nombre === "IDAT") idat.push(datos);
  else if (nombre === "IEND") break;
  pos += 12 + len;
}
if (prof !== 8 || (tipo !== 2 && tipo !== 6)) {
  throw new Error(`PNG inesperado: profundidad ${prof}, tipo ${tipo}`);
}

const canales = tipo === 6 ? 4 : 3;
const crudo = zlib.inflateSync(Buffer.concat(idat));

// Deshacer los filtros por scanline (PNG spec §9)
const px = Buffer.alloc(ancho * alto * canales);
const bpp = canales;
for (let y = 0; y < alto; y++) {
  const filtro = crudo[y * (ancho * canales + 1)];
  const org = y * (ancho * canales + 1) + 1;
  const dst = y * ancho * canales;
  for (let i = 0; i < ancho * canales; i++) {
    const x = crudo[org + i];
    const a = i >= bpp ? px[dst + i - bpp] : 0;
    const b = y > 0 ? px[dst - ancho * canales + i] : 0;
    const c = y > 0 && i >= bpp ? px[dst - ancho * canales + i - bpp] : 0;
    let v;
    if (filtro === 0) v = x;
    else if (filtro === 1) v = x + a;
    else if (filtro === 2) v = x + b;
    else if (filtro === 3) v = x + ((a + b) >> 1);
    else if (filtro === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
    } else throw new Error(`Filtro ${filtro} desconocido`);
    px[dst + i] = v & 0xff;
  }
}

// --- pasar a RGBA ----------------------------------------------------------
const rgba = Buffer.alloc(ancho * alto * 4, 255);
for (let i = 0; i < ancho * alto; i++) {
  rgba[i * 4] = px[i * canales];
  rgba[i * 4 + 1] = px[i * canales + 1];
  rgba[i * 4 + 2] = px[i * canales + 2];
  rgba[i * 4 + 3] = canales === 4 ? px[i * canales + 3] : 255;
}

// --- modo negativo --------------------------------------------------------
// "Color a transparencia" contra blanco: el alfa es cuánto se aparta el píxel
// del blanco, y el color se des-mezcla con ese alfa. Así los bordes suavizados
// no dejan un halo claro. En modo negativo `tolerancia` es la saturación bajo
// la cual un píxel se considera tinta neutra y pasa a blanco.
if (modo === "negativo") {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  for (let i = 0; i < ancho * alto; i++) {
    const o = i * 4;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    const alfaOriginal = rgba[o + 3] / 255;
    let alfa = (255 - Math.min(r, g, b)) / 255;
    if (alfa <= 0.02) { rgba[o + 3] = 0; continue; }
    const saturado = Math.max(r, g, b) - Math.min(r, g, b) >= tolerancia;
    // En los colores, el alfa se refuerza: si no, el brillo claro del centro
    // del arco dorado quedaría casi transparente y se vería como un hueco.
    if (saturado) alfa = Math.min(1, alfa * 2.5);
    const desmezclar = (c) => clamp((c - 255 * (1 - alfa)) / alfa);
    if (saturado) {
      rgba[o] = desmezclar(r);
      rgba[o + 1] = desmezclar(g);
      rgba[o + 2] = desmezclar(b);
    } else {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = 255; // tinta neutra → blanco
    }
    rgba[o + 3] = clamp(alfa * alfaOriginal * 255);
  }
}

// --- inundación desde los bordes ------------------------------------------
const esFondo = (i) => {
  const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
  return modo === "negro"
    ? r <= tolerancia && g <= tolerancia && b <= tolerancia
    : r >= 255 - tolerancia && g >= 255 - tolerancia && b >= 255 - tolerancia;
};

const visto = new Uint8Array(ancho * alto);
const cola = [];
// En modo negativo el fondo ya quedó transparente: no hay nada que inundar.
if (modo !== "negativo") {
  for (let x = 0; x < ancho; x++) {
    cola.push(x, (alto - 1) * ancho + x);
  }
  for (let y = 0; y < alto; y++) {
    cola.push(y * ancho, y * ancho + ancho - 1);
  }
}
let quitados = 0;
while (cola.length) {
  const i = cola.pop();
  if (visto[i]) continue;
  visto[i] = 1;
  if (!esFondo(i)) continue;
  rgba[i * 4 + 3] = 0;
  quitados++;
  const x = i % ancho, y = (i / ancho) | 0;
  if (x > 0) cola.push(i - 1);
  if (x < ancho - 1) cola.push(i + 1);
  if (y > 0) cola.push(i - ancho);
  if (y < alto - 1) cola.push(i + ancho);
}

// --- recortar al contenido -------------------------------------------------
let x0 = ancho, y0 = alto, x1 = -1, y1 = -1;
for (let y = 0; y < alto; y++) {
  for (let x = 0; x < ancho; x++) {
    if (rgba[(y * ancho + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
}
if (x1 < 0) throw new Error("Quedó todo transparente: revisá la tolerancia");
const nAncho = x1 - x0 + 1;
const nAlto = y1 - y0 + 1;

// --- re-codificar ----------------------------------------------------------
const conFiltro = Buffer.alloc(nAlto * (nAncho * 4 + 1));
for (let y = 0; y < nAlto; y++) {
  conFiltro[y * (nAncho * 4 + 1)] = 0; // filtro None: comprime bien igual
  rgba.copy(
    conFiltro,
    y * (nAncho * 4 + 1) + 1,
    ((y + y0) * ancho + x0) * 4,
    ((y + y0) * ancho + x0 + nAncho) * 4
  );
}

const crc32 = (b) => {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
};
const chunk = (nombre, datos) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(nombre, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([len, cuerpo, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(nAncho, 0);
ihdr.writeUInt32BE(nAlto, 4);
ihdr[8] = 8;
ihdr[9] = 6; // RGBA
fs.writeFileSync(
  salida,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(conFiltro, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
);

console.log(
  `${entrada} ${ancho}x${alto} → ${salida} ${nAncho}x${nAlto} | ` +
    `${quitados} px de fondo quitados (${((quitados / (ancho * alto)) * 100).toFixed(1)}%)`
);
