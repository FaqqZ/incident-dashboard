// CapasTerritoriales.jsx — distritos, circuitos electorales y barrios sobre el
// mapa del COMM.
//
// Las capas son OPCIONALES: arrancan apagadas y cada una se prende desde la
// barra del mapa. Los GeoJSON están en client/public/capas/ y se piden recién
// cuando se prenden (barrios pesa 217 KB). Salen de scripts/convertirCapas.js,
// que los reproyecta a lat/lng: los originales venían en metros (POSGAR 2007).
//
// Además de dibujarse, cada polígono FILTRA: al hacer clic, el mapa muestra
// solo los puntos que caen adentro. El conteo es un punto-en-polígono con la
// ubicación de la cámara, así que no depende de que la base traiga el barrio.

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, Pane, useMap } from "react-leaflet";

// Colores literales (Leaflet los escribe como atributos del SVG). Ninguno es
// amarillo, rojo ni naranja: esos ya significan máximo y clase de recurrencia.
export const CAPAS = [
  {
    clave: "distritos",
    titulo: "Distritos",
    color: "#1d3557",
    peso: 2.6,
    relleno: 0.04,
    z: 380,
  },
  {
    clave: "circuitos",
    titulo: "Circuitos electorales",
    color: "#7b2cbf",
    peso: 1.8,
    relleno: 0.03,
    trazo: "6 4",
    z: 370,
  },
  {
    clave: "barrios",
    titulo: "Barrios y zonas",
    color: "#0f7c7e",
    peso: 1,
    relleno: 0.07,
    z: 360,
  },
];

const POR_CLAVE = Object.fromEntries(CAPAS.map((c) => [c.clave, c]));
const CLAVE_STORAGE = "comm.capasActivas";

// --- carga (una sola vez por sesión, compartida entre mapas) ---------------

const cache = {};

function cargarCapa(clave) {
  if (!cache[clave]) {
    cache[clave] = fetch(`${import.meta.env.BASE_URL}capas/${clave}.geojson`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((geo) => {
        // Caja envolvente por polígono: descarta rápido los puntos lejanos
        // antes del punto-en-polígono.
        geo.features.forEach((f, i) => {
          f.properties._i = i;
          f._caja = cajaDe(f.geometry.coordinates);
        });
        return geo;
      })
      .catch((e) => {
        delete cache[clave]; // que el próximo intento vuelva a pedirla
        throw e;
      });
  }
  return cache[clave];
}

function cajaDe(multi) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pol of multi) {
    for (const [x, y] of pol[0]) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}

function enAnillo(x, y, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

export function contiene(feature, p) {
  const x = p.lng;
  const y = p.lat;
  const [x0, y0, x1, y1] = feature._caja;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  return feature.geometry.coordinates.some(
    (pol) => enAnillo(x, y, pol[0]) && !pol.slice(1).some((hueco) => enAnillo(x, y, hueco))
  );
}

// --- estado -----------------------------------------------------------------

function leerGuardadas() {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_STORAGE) || "[]");
    return Array.isArray(v) ? v.filter((c) => POR_CLAVE[c]) : [];
  } catch {
    return [];
  }
}

// Qué capas están prendidas y el GeoJSON de cada una. La selección se recuerda
// en el navegador: quien trabaja por distrito no tiene que prenderla en cada
// vista.
export function useCapas() {
  const [activas, setActivas] = useState(leerGuardadas);
  const [datos, setDatos] = useState({});

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_STORAGE, JSON.stringify(activas));
    } catch { /* sin storage igual funciona */ }

    let vigente = true;
    activas.forEach((clave) => {
      if (datos[clave]?.geo) return;
      setDatos((d) => ({ ...d, [clave]: { cargando: true } }));
      cargarCapa(clave)
        .then((geo) => vigente && setDatos((d) => ({ ...d, [clave]: { geo } })))
        .catch(() => vigente && setDatos((d) => ({ ...d, [clave]: { error: true } })));
    });
    return () => {
      vigente = false;
    };
    // `datos` no va: la carga depende solo de qué se prendió.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activas]);

  const alternar = (clave) =>
    setActivas((a) => (a.includes(clave) ? a.filter((c) => c !== clave) : [...a, clave]));

  return { activas, datos, alternar };
}

// --- presentación -----------------------------------------------------------

const nf = (n) => (n ?? 0).toLocaleString("es-AR");

const escapar = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function detalleBarrio(p) {
  return [p.tipo, p.distrito, p.circuito && `Circuito ${p.circuito}`].filter(Boolean).join(" · ");
}

// Botonera de la barra del mapa + aviso del filtro activo.
export function SelectorCapas({ activas, datos, alternar, foco, onQuitarFoco, resumenFoco, etiquetaTotal }) {
  return (
    <div className="map-capas">
      <span className="map-capas-titulo">Capas</span>
      {CAPAS.map((c) => {
        const on = activas.includes(c.clave);
        const estado = datos[c.clave];
        return (
          <button
            key={c.clave}
            type="button"
            className={on ? "capa-chip on" : "capa-chip"}
            aria-pressed={on}
            onClick={() => alternar(c.clave)}
            title={on ? `Ocultar ${c.titulo.toLowerCase()}` : `Mostrar ${c.titulo.toLowerCase()}`}
          >
            <i
              className="capa-muestra"
              style={{
                borderColor: c.color,
                borderStyle: c.trazo ? "dashed" : "solid",
                background: on ? `${c.color}33` : "transparent",
              }}
            />
            {c.titulo}
            {on && estado?.geo && <span className="capa-n">{estado.geo.features.length}</span>}
            {on && estado?.cargando && <span className="capa-n">…</span>}
            {on && estado?.error && <span className="capa-n capa-error">sin cargar</span>}
          </button>
        );
      })}

      {foco ? (
        <span className="capa-foco">
          <i className="capa-muestra" style={{ borderColor: POR_CLAVE[foco.clave].color }} />
          <span>
            Solo <b>{foco.nombre}</b>: {nf(resumenFoco.puntos)} puntos · {nf(resumenFoco.total)}{" "}
            {etiquetaTotal.toLowerCase()}
          </span>
          <button type="button" onClick={onQuitarFoco} aria-label="Quitar filtro territorial">
            ×
          </button>
        </span>
      ) : (
        activas.length > 0 && <span className="map-capas-ayuda">Clic en un polígono para filtrar los puntos</span>
      )}
    </div>
  );
}

// Una capa dibujada. Va en su propio pane, debajo de los puntos (overlayPane
// es 400): así los círculos siguen recibiendo el mouse encima de los polígonos
// y las capas quedan siempre en el mismo orden, sin importar cuál se prendió
// primero.
//
// Con varias capas prendidas, solo la más fina lleva relleno: el relleno de un
// distrito (que va arriba) tapaba a los barrios y el clic nunca les llegaba.
// Las más gruesas quedan como contorno, y el contorno sigue respondiendo.
function Capa({ capa, geo, resumen, foco, onFoco, etiquetaTotal, conRelleno }) {
  const map = useMap();
  const enFoco = (f) => foco && foco.clave === capa.clave && foco.i === f.properties._i;

  const estilo = (f, hover = false) => {
    const elegido = enFoco(f);
    return {
      color: capa.color,
      weight: capa.peso + (elegido ? 1.6 : 0) + (hover ? 1 : 0),
      opacity: 0.9,
      dashArray: capa.trazo || null,
      fill: conRelleno,
      fillColor: capa.color,
      fillOpacity: elegido ? 0.16 : hover ? capa.relleno + 0.08 : capa.relleno,
    };
  };

  // Leaflet guarda los handlers al crear la capa: se leen por ref para que
  // vean el foco y los conteos actuales sin volver a construir los polígonos.
  const vivo = useRef({});
  vivo.current = { estilo, resumen, onFoco, etiquetaTotal };

  const onEachFeature = (f, layer) => {
    layer.bindTooltip(
      () => {
        const { resumen: r, etiquetaTotal: et } = vivo.current;
        const n = r.get(f.properties._i) || { puntos: 0, total: 0 };
        const extra = capa.clave === "barrios" ? detalleBarrio(f.properties) : "";
        return (
          `<b>${escapar(f.properties.nombre || "Sin nombre")}</b>` +
          (extra ? `<br><span class="capa-tt-sub">${escapar(extra)}</span>` : "") +
          `<hr>Puntos con registros: <b>${nf(n.puntos)}</b><br>${escapar(et)}: <b>${nf(n.total)}</b>` +
          `<br><span class="capa-tt-sub">Clic para ver solo esta zona</span>`
        );
      },
      { sticky: true, className: "tooltip-recurrencia", pane: "tooltipPane" }
    );
    layer.on({
      mouseover: () => layer.setStyle(vivo.current.estilo(f, true)),
      mouseout: () => layer.setStyle(vivo.current.estilo(f)),
      click: () => {
        vivo.current.onFoco(capa.clave, f);
        map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 16 });
      },
    });
  };

  return (
    <Pane name={`capa-${capa.clave}`} style={{ zIndex: capa.z }}>
      <GeoJSON data={geo} style={(f) => estilo(f)} onEachFeature={onEachFeature} />
    </Pane>
  );
}

export function CapasEnMapa({ activas, datos, resumenes, foco, onFoco, etiquetaTotal }) {
  const cargadas = CAPAS.filter((c) => activas.includes(c.clave) && datos[c.clave]?.geo);
  // CAPAS va de la más gruesa a la más fina.
  const masFina = cargadas[cargadas.length - 1]?.clave;
  return cargadas.map((c) => (
    <Capa
      key={c.clave}
      capa={c}
      geo={datos[c.clave].geo}
      resumen={resumenes[c.clave]}
      foco={foco}
      onFoco={onFoco}
      etiquetaTotal={etiquetaTotal}
      conRelleno={c.clave === masFina}
    />
  ));
}

// Conteo de puntos y registros por polígono, para cada capa cargada.
export function useResumenes(datos, activas, puntos) {
  return useMemo(() => {
    const out = {};
    activas.forEach((clave) => {
      const geo = datos[clave]?.geo;
      if (!geo) return;
      const m = new Map();
      geo.features.forEach((f) => {
        let n = 0;
        let total = 0;
        puntos.forEach((p) => {
          if (contiene(f, p)) {
            n++;
            total += p.svAcumulados || 0;
          }
        });
        m.set(f.properties._i, { puntos: n, total });
      });
      out[clave] = m;
    });
    return out;
  }, [datos, activas, puntos]);
}
