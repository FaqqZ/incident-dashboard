// RecurrenciaMap.jsx — mapa de recurrencia territorial de siniestros viales
// detectados por el COMM.
//
// Reglas tomadas de "Instrucciones para mapa de siniestros viales":
//   · El color sale DIRECTO del campo "Color" de Hoja2 (§5). No se recalcula.
//   · SIN SEÑAL queda visible pero con menos intensidad que el resto (§5).
//   · La prioridad piloto se marca con un CONTORNO extra, sin tocar el color
//     de la clase de recurrencia (§7).
//   · El tooltip muestra los ocho campos pedidos (§6).

import { Fragment, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";

const CENTRO = [-26.8241, -65.2226];
const ZOOM = 13;

// §5 — correspondencia de colores. SIN SEÑAL en gris claro.
export const COLOR_HEX = {
  ROJO: "#d62828",
  NARANJA: "#f77f00",
  AMARILLO: "#f2c14e",
  "SIN SEÑAL": "#9fb0c2",
};

// Los puntos SIN SEÑAL se dibujan más chicos y translúcidos: siguen visibles
// pero no compiten con los que sí tienen señal de recurrencia.
function estiloPunto(p) {
  const sinSenal = p.color === "SIN SEÑAL";
  return {
    radius: sinSenal ? 4 : 8,
    fillColor: COLOR_HEX[p.color] || COLOR_HEX["SIN SEÑAL"],
    fillOpacity: sinSenal ? 0.45 : 0.9,
    color: sinSenal ? "#7c8ea1" : "#3d3d3d",
    weight: sinSenal ? 0.5 : 1,
  };
}

const nf = (n, d = 0) =>
  (n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

function AjustarVista({ puntos }) {
  const map = useMap();
  useEffect(() => {
    const conCoords = puntos.filter((p) => p.lat !== null && p.lng !== null);
    if (!conCoords.length) return;
    const el = map.getContainer();
    if (!el.clientWidth || !el.clientHeight) return;
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(conCoords.map((p) => [p.lat, p.lng])), {
      padding: [30, 30],
      maxZoom: 15,
    });
  }, [map, puntos]);
  return null;
}

// Mismo problema que en el mapa de incidentes: si el contenedor arranca con
// ancho 0 (pestaña oculta, panel colapsado) Leaflet queda con el tamaño mal.
function Redimensionar() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [map]);
  return null;
}

export default function RecurrenciaMap({ puntos }) {
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const contenedorRef = useRef(null);

  const enFullscreenNativo = () =>
    Boolean(document.fullscreenElement || document.webkitFullscreenElement);

  const alternarPantallaCompleta = () => {
    const el = contenedorRef.current;
    if (enFullscreenNativo()) {
      const salir = document.exitFullscreen || document.webkitExitFullscreen;
      try { salir?.call(document); } catch { /* el estado local igual se apaga */ }
      setPantallaCompleta(false);
      return;
    }
    // El overlay CSS se aplica siempre; la Fullscreen API es una mejora encima.
    setPantallaCompleta(true);
    const pedir = el?.requestFullscreen || el?.webkitRequestFullscreen;
    if (typeof pedir !== "function") return;
    try {
      const r = pedir.call(el);
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch { /* queda el overlay */ }
  };

  useEffect(() => {
    const onFsChange = () => {
      if (!enFullscreenNativo()) setPantallaCompleta(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  useEffect(() => {
    if (!pantallaCompleta) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !enFullscreenNativo()) setPantallaCompleta(false);
    };
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previo;
    };
  }, [pantallaCompleta]);

  const ubicables = puntos.filter((p) => p.lat !== null && p.lng !== null);

  // Los que tienen señal se dibujan ÚLTIMOS para que queden por encima de los
  // grises y no se pierdan detrás de ellos.
  const ordenados = [...ubicables].sort((a, b) => {
    const peso = (p) => (p.color === "SIN SEÑAL" ? 0 : 1);
    return peso(a) - peso(b);
  });

  return (
    <div ref={contenedorRef} className={pantallaCompleta ? "map-wrap map-fs" : "map-wrap"}>
      <div className="map-bar">
        <div className="recurrencia-leyenda">
          {["ROJO", "NARANJA", "AMARILLO", "SIN SEÑAL"].map((c) => (
            <span key={c} className="leyenda-item">
              <i className="leyenda-punto" style={{ background: COLOR_HEX[c] }} />
              {c === "ROJO" && "Muy alta (≥ P95)"}
              {c === "NARANJA" && "Alta (P90–P95)"}
              {c === "AMARILLO" && "Relevante (P75–P90)"}
              {c === "SIN SEÑAL" && "Sin señal (< P75)"}
            </span>
          ))}
          <span className="leyenda-item">
            <i className="leyenda-anillo leyenda-anillo-1" />
            Prioridad 1
          </span>
          <span className="leyenda-item">
            <i className="leyenda-anillo leyenda-anillo-2" />
            Prioridad 2
          </span>
        </div>

        <button className="btn" onClick={alternarPantallaCompleta} aria-pressed={pantallaCompleta}>
          {pantallaCompleta ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
        </button>
      </div>

      <div className="map-shell">
        <MapContainer center={CENTRO} zoom={ZOOM} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <AjustarVista puntos={ubicables} />
          <Redimensionar />

          {ordenados.map((p) => {
            const estilo = estiloPunto(p);
            const priorizado = p.prioridad && p.prioridad !== "SIN PRIORIDAD";
            return (
              <Fragment key={p.dispositivo}>
                {/* §7 — el contorno señala la prioridad piloto SIN alterar el
                    color de la clase de recurrencia. */}
                {priorizado && (
                  <CircleMarker
                    center={[p.lat, p.lng]}
                    radius={estilo.radius + 5}
                    interactive={false}
                    pathOptions={{
                      fill: false,
                      color: "#1b2a3a",
                      weight: 2,
                      dashArray: p.prioridad === "PRIORIDAD 2" ? "3 3" : null,
                    }}
                  />
                )}
                <CircleMarker center={[p.lat, p.lng]} radius={estilo.radius} pathOptions={estilo}>
                  <Tooltip direction="top" offset={[0, -6]} className="tooltip-recurrencia" sticky>
                    <b>{p.dispositivo}</b>
                    <br />
                    {p.ubicacion}
                    <hr />
                    SV acumulados: <b>{nf(p.svAcumulados)}</b>
                    <br />
                    SV promedio mensual: <b>{nf(p.svPromedioMensual, 2)}</b>
                    <br />
                    Meses con SV: <b>{nf(p.mesesConSV)}</b>
                    <br />
                    Persistencia: <b>{nf(p.persistencia, 1)}%</b>
                    <br />
                    Clase de recurrencia: <b>{p.clase}</b>
                    <br />
                    Prioridad piloto: <b>{p.prioridad}</b>
                  </Tooltip>
                </CircleMarker>
              </Fragment>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
