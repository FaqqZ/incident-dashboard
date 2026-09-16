// CapasTerritoriales.jsx — distritos, circuitos electorales y barrios sobre el
// mapa del COMM.
//
// Las capas son OPCIONALES: arrancan apagadas y cada una se prende desde la
// barra del mapa. Los GeoJSON están en client/public/capas/ y se piden recién
// cuando hacen falta (barrios pesa 217 KB). Salen de scripts/convertirCapas.js,
// que los reproyecta a lat/lng: los originales venían en metros (POSGAR 2007).
//
// Además de dibujarse, FILTRAN: hay un desplegable por capa (distrito,
// circuito, barrio) y el clic sobre un polígono elige ese mismo valor. Los
// tres se combinan: el mapa muestra solo los puntos que caen dentro de TODOS
// los polígonos elegidos. El cruce es un punto-en-polígono con la ubicación de
// la cámara, así que no depende de que la base traiga el barrio.

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, Pane, useMap } from "react-leaflet";
import L from "leaflet";

// Colores literales (Leaflet los escribe como atributos del SVG). Ninguno es
// amarillo, rojo ni naranja: esos ya significan máximo y clase de recurrencia.
export const CAPAS = [
  {
    clave: "distritos",
    titulo: "Distritos",
    singular: "Distrito",
    todos: "Todos",
    color: "#1d3557",
    peso: 2.6,
    relleno: 0.04,
    z: 380,
  },
  {
    clave: "circuitos",
    titulo: "Circuitos electorales",
    singular: "Circuito",
    todos: "Todos",
    color: "#7b2cbf",
    peso: 1.8,
    relleno: 0.03,
    trazo: "6 4",
    z: 370,
  },
  {
    clave: "barrios",
    titulo: "Barrios y zonas",
    singular: "Barrio o zona",
    todos: "Todos",
    color: "#0f7c7e",
    peso: 1,
    relleno: 0.07,
    z: 360,
  },
];

const POR_CLAVE = Object.fromEntries(CAPAS.map((c) => [c.clave, c]));
const CLAVE_STORAGE = "comm.capasActivas";

export const SIN_SELECCION = { distritos: null, circuitos: null, barrios: null };

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

// Qué capas están prendidas, el GeoJSON de cada una y qué polígono está
// elegido en cada capa. Las capas prendidas se recuerdan en el navegador
// (quien trabaja por distrito no tiene que prenderlas en cada vista); la
// selección no, porque es un filtro de la consulta del momento.
export function useCapas() {
  const [activas, setActivas] = useState(leerGuardadas);
  const [datos, setDatos] = useState({});
  const [seleccion, setSeleccion] = useState(SIN_SELECCION);
  const pedidas = useRef(new Set());

  // Pide el GeoJSON sin prender la capa: los desplegables lo necesitan para
  // armar su lista aunque la capa no esté dibujada.
  const cargar = (clave) => {
    if (pedidas.current.has(clave)) return;
    pedidas.current.add(clave);
    setDatos((d) => ({ ...d, [clave]: { cargando: true } }));
    cargarCapa(clave)
      .then((geo) => setDatos((d) => ({ ...d, [clave]: { geo } })))
      .catch(() => {
        pedidas.current.delete(clave); // permite reintentar
        setDatos((d) => ({ ...d, [clave]: { error: true } }));
      });
  };

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_STORAGE, JSON.stringify(activas));
    } catch { /* sin storage igual funciona */ }
    activas.forEach(cargar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activas]);

  // Apagar una capa suelta su filtro: no tiene sentido filtrar por un
  // polígono que no se ve.
  const alternar = (clave) => {
    if (activas.includes(clave)) {
      setActivas((a) => a.filter((c) => c !== clave));
      setSeleccion((s) => ({ ...s, [clave]: null }));
    } else {
      setActivas((a) => [...a, clave]);
    }
  };

  // Elegir un polígono (desde el desplegable o con un clic) prende su capa.
  // Con `i === null` se suelta el filtro de esa capa.
  const elegir = (clave, i) => {
    setSeleccion((s) => {
      const nueva = { ...s, [clave]: i };
      // Si el barrio elegido no pertenece al distrito o circuito nuevo, se
      // suelta: si no, la combinación daría vacía sin que se note por qué.
      const barrio = nueva.barrios !== null && datos.barrios?.geo?.features[nueva.barrios];
      if (barrio && clave !== "barrios" && i !== null) {
        const nombre = datos[clave]?.geo?.features[i]?.properties;
        const p = barrio.properties;
        const choca =
          (clave === "distritos" && nombre && p.distrito && p.distrito !== nombre.nombre) ||
          (clave === "circuitos" && nombre && p.circuito && `Circuito ${p.circuito}` !== nombre.nombre);
        if (choca) nueva.barrios = null;
      }
      return nueva;
    });
    if (i !== null && !activas.includes(clave)) setActivas((a) => [...a, clave]);
  };

  const limpiar = () => setSeleccion(SIN_SELECCION);

  // Features elegidas, solo de capas prendidas y ya cargadas.
  const elegidas = CAPAS.map((c) => c.clave)
    .filter((k) => seleccion[k] !== null && activas.includes(k) && datos[k]?.geo)
    .map((k) => ({ clave: k, feature: datos[k].geo.features[seleccion[k]] }))
    .filter((e) => e.feature);

  return { activas, datos, alternar, cargar, seleccion, elegir, limpiar, elegidas };
}

// --- presentación -----------------------------------------------------------

const nf = (n) => (n ?? 0).toLocaleString("es-AR");

const escapar = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const nombreDe = (f) => f.properties.nombre || `Sin nombre (${f.properties.id ?? f.properties._i})`;

function detalleBarrio(p) {
  return [p.tipo, p.distrito, p.circuito && `Circuito ${p.circuito}`].filter(Boolean).join(" · ");
}

// Orden natural: "Distrito 2" antes que "Distrito 10", "Circuito 9A" después
// de "Circuito 9".
const colador = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

// Opciones de cada desplegable. Los barrios se acotan al distrito y al
// circuito elegidos, según la asignación de la auditoría.
function opcionesDe(clave, datos, seleccion) {
  const geo = datos[clave]?.geo;
  if (!geo) return [];
  let features = geo.features;
  if (clave === "barrios") {
    const d = seleccion.distritos !== null && datos.distritos?.geo?.features[seleccion.distritos];
    const c = seleccion.circuitos !== null && datos.circuitos?.geo?.features[seleccion.circuitos];
    features = features.filter(
      (f) =>
        (!d || f.properties.distrito === d.properties.nombre) &&
        (!c || `Circuito ${f.properties.circuito}` === c.properties.nombre)
    );
  }
  return features
    .map((f) => ({
      valor: f.properties._i,
      texto: clave === "barrios" && f.properties.tipo === "Zona" ? `${nombreDe(f)} (zona)` : nombreDe(f),
    }))
    .sort((a, b) => colador.compare(a.texto, b.texto));
}

// Botonera de capas + desplegables de filtro + aviso del filtro activo.
export function SelectorCapas({ capas, resumen, etiquetaTotal }) {
  const { activas, datos, alternar, cargar, seleccion, elegir, limpiar, elegidas } = capas;
  return (
    <div className="map-territorio">
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
      </div>

      <div className="map-capas">
        <span className="map-capas-titulo">Filtrar</span>
        {CAPAS.map((c) => {
          const estado = datos[c.clave];
          const opciones = opcionesDe(c.clave, datos, seleccion);
          const valor = activas.includes(c.clave) && seleccion[c.clave] !== null ? seleccion[c.clave] : "";
          return (
            <label
              key={c.clave}
              className={valor !== "" ? "capa-filtro on" : "capa-filtro"}
              style={{ "--capa": c.color }}
            >
              <span>{c.singular}</span>
              <select
                value={valor}
                // La lista se pide recién cuando alguien va a usarla.
                onFocus={() => cargar(c.clave)}
                onPointerDown={() => cargar(c.clave)}
                onChange={(e) => elegir(c.clave, e.target.value === "" ? null : Number(e.target.value))}
              >
                <option value="">{estado?.cargando ? "Cargando…" : estado?.error ? "No se pudo cargar" : c.todos}</option>
                {opciones.map((o) => (
                  <option key={o.valor} value={o.valor}>{o.texto}</option>
                ))}
              </select>
            </label>
          );
        })}

        {elegidas.length > 0 ? (
          <span className="capa-foco">
            <span>
              {nf(resumen.puntos)} puntos · {nf(resumen.total)} {etiquetaTotal.toLowerCase()}
            </span>
            <button type="button" onClick={limpiar} aria-label="Quitar filtros territoriales" title="Quitar filtros">
              ×
            </button>
          </span>
        ) : (
          activas.length > 0 && <span className="map-capas-ayuda">o clic en un polígono del mapa</span>
        )}
      </div>
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
function Capa({ capa, geo, resumen, elegido, onElegir, etiquetaTotal, conRelleno }) {
  const esElegido = (f) => elegido === f.properties._i;

  const estilo = (f, hover = false) => {
    const sel = esElegido(f);
    return {
      color: capa.color,
      weight: capa.peso + (sel ? 1.6 : 0) + (hover ? 1 : 0),
      opacity: 0.9,
      dashArray: capa.trazo || null,
      fill: conRelleno || sel,
      fillColor: capa.color,
      fillOpacity: sel ? 0.16 : hover ? capa.relleno + 0.08 : capa.relleno,
    };
  };

  // Leaflet guarda los handlers al crear la capa: se leen por ref para que
  // vean la selección y los conteos actuales sin reconstruir los polígonos.
  const vivo = useRef({});
  vivo.current = { estilo, resumen, onElegir, etiquetaTotal, esElegido };

  const onEachFeature = (f, layer) => {
    layer.bindTooltip(
      () => {
        const { resumen: r, etiquetaTotal: et, esElegido: sel } = vivo.current;
        const n = r?.get(f.properties._i) || { puntos: 0, total: 0 };
        const extra = capa.clave === "barrios" ? detalleBarrio(f.properties) : "";
        return (
          `<b>${escapar(nombreDe(f))}</b>` +
          (extra ? `<br><span class="capa-tt-sub">${escapar(extra)}</span>` : "") +
          `<hr>Puntos con registros: <b>${nf(n.puntos)}</b><br>${escapar(et)}: <b>${nf(n.total)}</b>` +
          `<br><span class="capa-tt-sub">${sel(f) ? "Clic para quitar el filtro" : "Clic para filtrar por esta zona"}</span>`
        );
      },
      { sticky: true, className: "tooltip-recurrencia" }
    );
    layer.on({
      mouseover: () => layer.setStyle(vivo.current.estilo(f, true)),
      mouseout: () => layer.setStyle(vivo.current.estilo(f)),
      click: () => {
        const v = vivo.current;
        v.onElegir(capa.clave, v.esElegido(f) ? null : f.properties._i);
      },
    });
  };

  return (
    <Pane name={`capa-${capa.clave}`} style={{ zIndex: capa.z }}>
      <GeoJSON data={geo} style={(f) => estilo(f)} onEachFeature={onEachFeature} />
    </Pane>
  );
}

// Acerca el mapa a la zona filtrada: la intersección de las cajas de los
// polígonos elegidos (si no se cruzan, la del más chico).
function EncuadrarSeleccion({ elegidas }) {
  const map = useMap();
  const clave = elegidas.map((e) => `${e.clave}:${e.feature.properties._i}`).join("|");
  useEffect(() => {
    if (!elegidas.length) return;
    const cajas = elegidas.map((e) => L.geoJSON(e.feature).getBounds());
    let caja = cajas.reduce((acc, b) => {
      const s = Math.max(acc.getSouth(), b.getSouth());
      const n = Math.min(acc.getNorth(), b.getNorth());
      const o = Math.max(acc.getWest(), b.getWest());
      const e = Math.min(acc.getEast(), b.getEast());
      return s < n && o < e ? L.latLngBounds([s, o], [n, e]) : acc;
    });
    if (!caja.isValid()) caja = cajas[cajas.length - 1];
    map.fitBounds(caja, { padding: [30, 30], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, clave]);
  return null;
}

export function CapasEnMapa({ capas, resumenes, etiquetaTotal }) {
  const { activas, datos, seleccion, elegir, elegidas } = capas;
  const cargadas = CAPAS.filter((c) => activas.includes(c.clave) && datos[c.clave]?.geo);
  // CAPAS va de la más gruesa a la más fina.
  const masFina = cargadas[cargadas.length - 1]?.clave;
  return (
    <>
      <EncuadrarSeleccion elegidas={elegidas} />
      {cargadas.map((c) => (
        <Capa
          key={c.clave}
          capa={c}
          geo={datos[c.clave].geo}
          resumen={resumenes[c.clave]}
          elegido={seleccion[c.clave]}
          onElegir={elegir}
          etiquetaTotal={etiquetaTotal}
          conRelleno={c.clave === masFina}
        />
      ))}
    </>
  );
}

// Conteo de puntos y registros por polígono, para cada capa prendida.
export function useResumenes(capas, puntos) {
  const { datos, activas } = capas;
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
