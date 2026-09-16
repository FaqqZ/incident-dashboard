// RecurrenciaMap.jsx — mapa de recurrencia territorial de siniestros viales
// detectados por el COMM.
//
// Reglas tomadas de "Instrucciones para mapa de siniestros viales":
//   · El color sale DIRECTO del campo "Color" de Hoja2 (§5). No se recalcula.
//   · SIN SEÑAL queda visible pero con menos intensidad que el resto (§5).
//   · La prioridad piloto se marca con un CONTORNO extra, sin tocar el color
//     de la clase de recurrencia (§7).
//   · El tooltip muestra los ocho campos pedidos (§6).

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import {
  CapasEnMapa, SelectorCapas, contiene, useCapas, useResumenes,
} from "./CapasTerritoriales";

const CENTRO = [-26.8241, -65.2226];
const ZOOM = 13;

// §5 — correspondencia de colores. SIN SEÑAL en gris claro.
// Amarillo institucional (--color-1). Va literal y no como var(): Leaflet
// escribe estos valores como atributos de presentación del SVG del mapa.
export const COLOR_MAXIMO = "#f4dc00";

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

// Con un filtro territorial no reencuadra: EncuadrarSeleccion ya acercó a esa
// zona. Al soltarlo, `enFoco` pasa a false y la vista vuelve a todos los puntos.
function AjustarVista({ puntos, enFoco }) {
  const map = useMap();
  useEffect(() => {
    if (enFoco) return;
    const conCoords = puntos.filter((p) => p.lat !== null && p.lng !== null);
    if (!conCoords.length) return;
    const el = map.getContainer();
    if (!el.clientWidth || !el.clientHeight) return;
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(conCoords.map((p) => [p.lat, p.lng])), {
      padding: [30, 30],
      maxZoom: 15,
    });
  }, [map, puntos, enFoco]);
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

// El instructivo del COMM (§6) fija los nombres de los campos del tooltip para
// el mapa de siniestros viales, así que "SV" es el valor por defecto. Pero el
// mismo mapa se usa para el resto de las categorías, donde hablar de "SV" o de
// "meses con SV" no significa nada: esas vistas pasan etiquetas genéricas.
export const ETIQUETAS_SV = {
  acumulados: "SV acumulados",
  promedio: "SV promedio mensual",
  meses: "Meses con SV",
};

export const ETIQUETAS_GENERICAS = {
  acumulados: "Incidentes acumulados",
  promedio: "Promedio mensual",
  meses: "Meses con registros",
};

export default function RecurrenciaMap({ puntos, etiquetas }) {
  const textos = etiquetas || ETIQUETAS_SV;
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

  // Memorizado: AjustarVista reencuadra cada vez que cambia este array, y sin
  // memo cambiaba en cada render (por ejemplo, al prender una capa).
  const ubicables = useMemo(
    () => puntos.filter((p) => p.lat !== null && p.lng !== null),
    [puntos]
  );

  // Capas territoriales y filtros por distrito, circuito y barrio (desde los
  // desplegables o con un clic sobre el polígono). Se combinan: quedan los
  // puntos que caen dentro de todos los polígonos elegidos.
  const capas = useCapas();
  const resumenes = useResumenes(capas, ubicables);
  const { elegidas } = capas;
  const hayFiltro = elegidas.length > 0;
  const claveFiltro = elegidas.map((e) => `${e.clave}:${e.feature.properties._i}`).join("|");
  const visibles = useMemo(
    () => (hayFiltro ? ubicables.filter((p) => elegidas.every((e) => contiene(e.feature, p))) : ubicables),
    // `elegidas` es un array nuevo en cada render; su identidad real es claveFiltro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ubicables, claveFiltro]
  );
  const resumenFiltro = {
    puntos: visibles.length,
    total: visibles.reduce((acc, p) => acc + (p.svAcumulados || 0), 0),
  };

  // Los que tienen señal se dibujan ÚLTIMOS para que queden por encima de los
  // grises y no se pierdan detrás de ellos.
  const ordenados = [...visibles].sort((a, b) => {
    const peso = (p) => (p.color === "SIN SEÑAL" ? 0 : 1);
    return peso(a) - peso(b);
  });

  // El dispositivo con más incidentes se señala con un anillo amarillo. El
  // color de relleno NO se toca: sigue siendo el de su clase, como exige el §5.
  // El §7 avala justamente esto: un marcador adicional en vez de otro color.
  // Con un filtro territorial, el máximo es el de esa zona.
  const maximo = visibles.reduce(
    (mejor, p) => (!mejor || p.svAcumulados > mejor.svAcumulados ? p : mejor),
    null
  );

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
          <span className="leyenda-item">
            <i className="leyenda-anillo leyenda-anillo-max" />
            Máximo
          </span>
        </div>

        <button className="btn" onClick={alternarPantallaCompleta} aria-pressed={pantallaCompleta}>
          {pantallaCompleta ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
        </button>
      </div>

      <SelectorCapas capas={capas} resumen={resumenFiltro} etiquetaTotal={textos.acumulados} />

      <div className="map-shell">
        <MapContainer center={CENTRO} zoom={ZOOM} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            // CARTO pasó a exigir clave: sus tiles seguían devolviendo 200 pero
            // con una imagen que dice "API KEY REQUIRED" estampada sobre el mapa.
            // OpenStreetMap no la pide y alcanza de sobra para esta escala.
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <AjustarVista puntos={ubicables} enFoco={hayFiltro} />
          <Redimensionar />
          <CapasEnMapa capas={capas} resumenes={resumenes} etiquetaTotal={textos.acumulados} />

          {ordenados.map((p) => {
            const estilo = estiloPunto(p);
            const priorizado = p.prioridad && p.prioridad !== "SIN PRIORIDAD";
            const esMaximo = maximo && p.dispositivo === maximo.dispositivo;
            return (
              <Fragment key={p.dispositivo}>
                {esMaximo && (
                  <CircleMarker
                    center={[p.lat, p.lng]}
                    radius={estilo.radius + 10}
                    interactive={false}
                    pathOptions={{ fill: false, color: COLOR_MAXIMO, weight: 3 }}
                  />
                )}
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
                    {textos.acumulados}: <b>{nf(p.svAcumulados)}</b>
                    <br />
                    {textos.promedio}: <b>{nf(p.svPromedioMensual, 2)}</b>
                    <br />
                    {textos.meses}: <b>{nf(p.mesesConSV)}</b>
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
