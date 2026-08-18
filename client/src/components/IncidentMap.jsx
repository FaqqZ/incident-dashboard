// IncidentMap.jsx — mapa de incidentes agregados por cámara.
// Dos modos: calor (peso = cantidad de incidentes) y burbujas (tamaño = cantidad),
// replicando el mapa de Power BI con Size = Recuento de dispositivo.

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

const CENTRO = [-26.8241, -65.2226]; // San Miguel de Tucumán
const ZOOM = 13;

// Valores por defecto para los sliders.
// Radio y difuminado bajaron (eran 30 y 15): el radio de leaflet.heat se mide
// en PÍXELES de pantalla, no en metros, así que con 30 px las ~480 cámaras del
// centro se fundían en una sola mancha al zoom inicial. Con 18 px los focos se
// distinguen sin tener que acercarse.
const DEFAULT_BLUR = 10;
const DEFAULT_RADIUS = 18;
const DEFAULT_INTENSITY = 60;

// Cuántos puntos se etiquetan cuando se pide ver el ranking sobre el mapa.
const TOP_N = 10;

const nfMapa = (n) => (n ?? 0).toLocaleString("es-AR");

// Colores del gradiente, de menor a mayor concentración. Calibrados para el
// mapa CLARO: el resto del tablero es oscuro, pero el mapa no.
const COLORES = ["#2f6f8f", "#4c9f70", "#e0a458", "#ed7d31", "#d1495b"];

const ETIQUETAS_BANDA = ["Bajo", "Moderado", "Elevado", "Alto", "Crítico"];

// Los umbrales NO son números elegidos a dedo: son cuantiles de la distribución
// real de incidentes por cámara. Así "crítico" significa algo concreto —el 2%
// de las cámaras con más carga— en vez de un 0,8 arbitrario que no dice nada.
const CUANTILES = [0.5, 0.8, 0.92, 0.98];

// Cómo se traduce la cantidad de incidentes a "peso" del punto.
// Antes había un techo FIJO (35) y rompía el mapa en las dos direcciones:
//   · sin filtro el máximo real es 7.619 y la mediana 21, así que 145 de 480
//     puntos (30%) saturaban: el punto crítico se veía igual que un tercio del mapa;
//   · con una categoría puesta los conteos caen a 3-14 y NADA llegaba a destacarse.
// Ahora el techo es el máximo del conjunto filtrado y la escala es logarítmica,
// que reparte mucho mejor una distribución tan asimétrica.
const WEIGHT_MIN = 0.15;      // piso, para que hasta 1 incidente se note
const HEAT_MIN_OPACITY = 0.4; // PISO: intensidad mínima visible

// Cantidad de incidentes de un punto según la categoría activa del mapa.
function cuentaDe(p, category) {
  return category && category !== "all" ? (p.porCategoria?.[category] || 0) : p.count;
}

// Peso de un punto: log normalizado al máximo del conjunto filtrado.
function pesoDe(count, maxCount) {
  return WEIGHT_MIN + (1 - WEIGHT_MIN) * (Math.log1p(count) / (Math.log1p(maxCount) || 1));
}

// Deriva los umbrales del gradiente y las bandas de la leyenda a partir de la
// distribución real. Devuelve también los cortes en incidentes, que es lo que
// permite decir "de tal número para arriba es crítico".
function escalaDesdeDatos(points, category) {
  const counts = points
    .map((p) => cuentaDe(p, category))
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  if (!counts.length) return null;

  const maxCount = counts[counts.length - 1];
  const cuantil = (q) => counts[Math.min(counts.length - 1, Math.round(q * (counts.length - 1)))];
  const cortes = CUANTILES.map(cuantil);

  // Umbrales estrictamente crecientes: con muchos conteos repetidos (por
  // ejemplo un montón de cámaras con 1 incidente) dos cuantiles pueden caer en
  // el mismo valor y el gradiente de leaflet.heat se rompe.
  let previo = 0;
  const gradient = cortes.map((c, i) => {
    const t = Math.min(0.98, Math.max(previo + 0.04, +pesoDe(c, maxCount).toFixed(2)));
    previo = t;
    return { threshold: t, color: COLORES[i] };
  });
  gradient.push({ threshold: 1, color: COLORES[4] });

  // Bandas para la leyenda, en incidentes. Se descartan las que quedan vacías
  // cuando varios cuantiles coinciden (pasa con categorías chicas, donde
  // medio padrón de cámaras tiene 1 solo incidente).
  const rangos = [];
  let desde = 1;
  cortes.forEach((corte) => {
    if (corte >= desde) {
      rangos.push({ desde, hasta: corte });
      desde = corte + 1;
    }
  });
  if (maxCount >= desde) rangos.push({ desde, hasta: maxCount });

  // Colores y etiquetas se asignan desde el final: la banda más alta siempre
  // tiene que leerse como "Crítico", aunque se hayan colapsado bandas.
  const off = COLORES.length - rangos.length;
  const bandas = rangos.map((r, i) => ({
    ...r,
    color: COLORES[off + i],
    etiqueta: ETIQUETAS_BANDA[off + i],
  }));

  return { gradient, bandas, maxCount, camaras: counts.length };
}

// leaflet.heat dibuja sobre un canvas del tamaño del mapa y llama a getImageData.
// Si el contenedor todavía mide 0 (pestaña oculta, panel colapsado, montaje antes
// del layout) tira "IndexSizeError: The source width is 0" y, al ser un throw
// durante el render de React, se cae TODA la página, no solo el mapa.
// Esto espera a que el contenedor tenga tamaño real antes de dibujar.
function useMapHasSize() {
  const map = useMap();
  const [hasSize, setHasSize] = useState(() => {
    const el = map.getContainer();
    return el.clientWidth > 0 && el.clientHeight > 0;
  });

  useEffect(() => {
    if (hasSize) return;
    const el = map.getContainer();
    const check = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        map.invalidateSize();
        setHasSize(true);
      }
    };
    const ro = new ResizeObserver(check);
    ro.observe(el);
    check();
    return () => ro.disconnect();
  }, [map, hasSize]);

  return hasSize;
}

function HeatLayer({ points, blur, radius, intensity, category, gradient }) {
  const map = useMap();
  const layerRef = useRef(null);
  const hasSize = useMapHasSize();
  useEffect(() => {
    if (!hasSize) return;
    // Convertir intensidad (0-100) a max de leaflet.heat (invertido: más intenso = max más bajo)
    const max = 1.0 - (intensity / 100) * 0.75;
    
    // Construir objeto gradient desde el array
    const gradientObj = {};
    gradient.forEach((g) => {
      gradientObj[g.threshold] = g.color;
    });
    
    // Techo adaptativo: el punto más cargado del conjunto FILTRADO siempre
    // llega al tope del gradiente, con o sin categoría puesta.
    const maxCount = points.reduce((m, p) => Math.max(m, cuentaDe(p, category)), 0);

    const heatData = points
      .map((p) => {
        const count = cuentaDe(p, category);
        if (count === 0) return null; // Excluir puntos sin incidentes de esta categoría
        return [p.lat, p.lng, pesoDe(count, maxCount)];
      })
      .filter(Boolean); // Remover nulls
    
    if (layerRef.current) map.removeLayer(layerRef.current);
    layerRef.current = L.heatLayer(heatData, {
      max,
      minOpacity: HEAT_MIN_OPACITY,
      radius,
      blur,
      maxZoom: 17,
      gradient: gradientObj,
    }).addTo(map);
    return () => { if (layerRef.current) map.removeLayer(layerRef.current); };
  }, [map, hasSize, points, blur, radius, intensity, category, gradient]);
  return null;
}

function FitBounds({ points }) {
  const map = useMap();
  const hasSize = useMapHasSize();
  useEffect(() => {
    if (!hasSize || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }, [map, hasSize, points]);
  return null;
}

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };
    
    // Usar ResizeObserver para detectar cambios en el contenedor
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    
    const mapContainer = map.getContainer();
    if (mapContainer) {
      resizeObserver.observe(mapContainer);
    }
    
    // También invalidar después de un pequeño delay al montar
    const timeout = setTimeout(() => {
      handleResize();
    }, 100);
    
    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeout);
    };
  }, [map]);
  return null;
}

// radio de burbuja proporcional a la cantidad (escala raíz para que no explote)
function radiusFor(count, max) {
  const min = 5, top = 28;
  if (max <= 1) return min;
  return min + (top - min) * Math.sqrt(count / max);
}

// Etiqueta cualitativa según umbral de intensidad
function getIntensityLabel(threshold) {
  if (threshold < 0.20) return "Muy baja";
  if (threshold < 0.40) return "Baja";
  if (threshold < 0.60) return "Media";
  if (threshold < 0.80) return "Alta";
  return "Muy alta";
}

// Convertir umbral a porcentaje
function thresholdToPercent(threshold) {
  return Math.round(threshold * 100) + "%";
}

export default function IncidentMap({ points, categoriaPrincipal }) {
  const [mode, setMode] = useState("heat");
  const [blur, setBlur] = useState(DEFAULT_BLUR);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);
  // Arranca en "todas" y no en la categoría principal: si el mapa se autofiltra
  // a una categoría mientras los KPIs y las barras muestran el total, los
  // números no coinciden (el punto top daba 7.579 en el mapa y 7.619 en el KPI).
  // La opción "Principal" sigue disponible para desglosar a mano.
  const [categoryMode, setCategoryMode] = useState("manual");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [gradient, setGradient] = useState([]);
  // Mientras nadie toque los sliders de umbral, mandan los datos.
  const [umbralesManuales, setUmbralesManuales] = useState(false);
  const [showUmbrales, setShowUmbrales] = useState(false);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [mostrarTop, setMostrarTop] = useState(false);
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);

  // En pantalla completa los sliders quedan escondidos por defecto: ocupaban
  // casi 400 px y al mapa le sobraban 300, justo lo contrario de lo buscado.
  // La leyenda sí queda siempre, que es lo que permite leer el mapa.
  const controlesVisibles = !pantallaCompleta || ajustesAbiertos;

  const contenedorRef = useRef(null);

  // Pantalla completa REAL (Fullscreen API): usa todo el monitor y esconde la
  // barra del navegador. Si el navegador la rechaza se cae al overlay CSS, que
  // igual ocupa toda la ventana.
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

    // El overlay CSS se aplica SIEMPRE y primero: es el que garantiza que el
    // botón haga algo. La Fullscreen API es una mejora encima, no un requisito.
    setPantallaCompleta(true);

    // OJO: nada de `el?.requestFullscreen?.().catch(...)`. Si el método no
    // existe (iOS Safari no soporta Fullscreen API fuera de <video>), la
    // expresión da undefined y el .catch encadenado tira TypeError, matando el
    // handler antes del fallback: el botón quedaba sin hacer nada.
    const pedir = el?.requestFullscreen || el?.webkitRequestFullscreen;
    if (typeof pedir !== "function") return;
    try {
      const r = pedir.call(el);
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch {
      /* se queda con el overlay, que ya está puesto */
    }
  };

  // El usuario puede salir con F11 o Esc sin pasar por el botón: hay que
  // escuchar al navegador para no quedar con el estado desincronizado.
  useEffect(() => {
    // Solo apaga el overlay si veníamos de fullscreen nativo: cuando la API no
    // está disponible nunca se dispara y el overlay tiene que seguir en pie.
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
      if (e.key !== "Escape") return;
      if (!document.fullscreenElement) setPantallaCompleta(false);
    };
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowPrevio;
    };
  }, [pantallaCompleta]);
  const max = points.reduce((m, p) => Math.max(m, p.count), 1);

  // Extraer categorías disponibles de los puntos
  const availableCategories = Array.from(
    new Set(
      points.flatMap((p) => Object.keys(p.porCategoria || {}))
    )
  ).sort();

  // Determinar categoría actual a usar
  const currentCategory = categoryMode === "auto"
    ? (categoriaPrincipal || "all")
    : selectedCategory;

  // Escala derivada de los datos visibles: umbrales del gradiente + bandas de
  // la leyenda, en incidentes.
  const escala = useMemo(
    () => escalaDesdeDatos(points, currentCategory),
    [points, currentCategory]
  );

  // Mientras el usuario no toque los umbrales a mano, siguen a los datos.
  useEffect(() => {
    if (umbralesManuales || !escala) return;
    setGradient(escala.gradient.map((g) => ({ ...g })));
  }, [escala, umbralesManuales]);

  // Puntos ordenados por carga según la categoría activa. Se recalculan con
  // cada cambio de filtro, así lo que se señala coincide con las barras.
  const puntosOrdenados = points
    .map((p) => ({ ...p, cuenta: cuentaDe(p, currentCategory) }))
    .filter((p) => p.cuenta > 0)
    .sort((a, b) => b.cuenta - a.cuenta);

  // Sin la opción activada se marca solo el #1; con ella, el top N. Sobre la
  // mancha de calor un pico aislado se confunde con un cluster denso, así que
  // los números hay que poder leerlos.
  const puntosMarcados = mostrarTop ? puntosOrdenados.slice(0, TOP_N) : puntosOrdenados.slice(0, 1);

  // Resetear a modo auto cuando cambia categoriaPrincipal (filtros globales)
  useEffect(() => {
    if (categoryMode === "auto" && categoriaPrincipal) {
      setSelectedCategory(categoriaPrincipal);
    }
  }, [categoriaPrincipal, categoryMode]);

  const resetSliders = () => {
    setBlur(DEFAULT_BLUR);
    setRadius(DEFAULT_RADIUS);
    setIntensity(DEFAULT_INTENSITY);
  };

  // Vuelve a los umbrales derivados de los datos actuales.
  const resetGradient = () => {
    setUmbralesManuales(false);
    if (escala) setGradient(escala.gradient.map((g) => ({ ...g })));
  };

  const handleThresholdChange = (index, newValue) => {
    setUmbralesManuales(true);
    const value = Math.round(newValue / 0.05) * 0.05; // Step de 0.05
    const clamped = Math.max(0, Math.min(1, value));

    setGradient((prev) => {
      const newGradient = [...prev];
      
      // Validar orden ascendente: no puede ser <= anterior ni >= siguiente
      if (index > 0) {
        newGradient[index].threshold = Math.max(prev[index - 1].threshold + 0.05, clamped);
      }
      if (index < newGradient.length - 1) {
        newGradient[index].threshold = Math.min(prev[index + 1].threshold - 0.05, newGradient[index].threshold);
      }
      if (index === 0) {
        newGradient[index].threshold = Math.min(prev[1].threshold - 0.05, clamped);
      }
      if (index === newGradient.length - 1) {
        newGradient[index].threshold = Math.max(prev[index - 1].threshold + 0.05, clamped);
      }
      
      return newGradient;
    });
  };

  const handleColorChange = (index, newColor) => {
    setUmbralesManuales(true);
    setGradient((prev) => {
      const newGradient = [...prev];
      newGradient[index] = { ...newGradient[index], color: newColor };
      return newGradient;
    });
  };

  // Construir objeto gradient para pasar al HeatLayer
  const gradientObj = gradient.reduce((acc, g) => {
    acc[g.threshold] = g.color;
    return acc;
  }, {});

  const handleCategoryChange = (e) => {
    const value = e.target.value;
    if (value === "auto") {
      setCategoryMode("auto");
      setSelectedCategory(categoriaPrincipal || "all");
    } else {
      setCategoryMode("manual");
      setSelectedCategory(value);
    }
  };

  return (
    <div ref={contenedorRef} className={pantallaCompleta ? "map-wrap map-fs" : "map-wrap"}>
      <div className="map-bar">
        <div className="map-toggle" role="tablist" aria-label="Modo de mapa">
          <button className={mode === "heat" ? "active" : ""} onClick={() => setMode("heat")}
            role="tab" aria-selected={mode === "heat"}>Mapa de calor</button>
          <button className={mode === "bubbles" ? "active" : ""} onClick={() => setMode("bubbles")}
            role="tab" aria-selected={mode === "bubbles"}>Burbujas</button>
        </div>

        <div className="map-bar-acciones">
          <label className="map-check">
            <input type="checkbox" checked={mostrarTop}
              onChange={(e) => setMostrarTop(e.target.checked)} />
            Etiquetar los {TOP_N} puntos más críticos
          </label>
          {pantallaCompleta && mode === "heat" && (
            <button className="btn" onClick={() => setAjustesAbiertos((v) => !v)}
              aria-pressed={ajustesAbiertos}>
              {ajustesAbiertos ? "Ocultar ajustes" : "Ajustes"}
            </button>
          )}
          <button className="btn" onClick={alternarPantallaCompleta}
            aria-pressed={pantallaCompleta}>
            {pantallaCompleta ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
          </button>
        </div>
      </div>

      {mode === "heat" && controlesVisibles && (
        <div className="heat-controls">
          <div className="control-row">
            <label>Categoría</label>
            <select
              value={categoryMode === "auto" ? "auto" : selectedCategory}
              onChange={handleCategoryChange}
            >
              <option value="auto">
                {categoryMode === "auto" && categoriaPrincipal
                  ? `Principal (${categoriaPrincipal})`
                  : "Principal (automático)"}
              </option>
              <option value="all">Todas las categorías</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div className="control-row">
            <label>Difuminado: {blur}</label>
            <input
              type="range"
              min="5"
              max="40"
              value={blur}
              onChange={(e) => setBlur(Number(e.target.value))}
            />
          </div>
          <div className="control-row">
            <label>Radio: {radius}</label>
            <input
              type="range"
              min="10"
              max="50"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
          </div>
          <div className="control-row">
            <label>Intensidad: {intensity}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
            />
          </div>
          <button className="reset-btn" onClick={resetSliders}>Restablecer sliders</button>
          
          <div style={{ marginTop: 20, borderTop: "1px solid var(--border)" }}>
            <button 
              className="collapsible-header" 
              onClick={() => setShowUmbrales(!showUmbrales)}
              aria-expanded={showUmbrales}
            >
              <span>Umbrales de color</span>
              <span className={`chevron ${showUmbrales ? "open" : ""}`}>▼</span>
            </button>
            
            {showUmbrales && (
              <div className="collapsible-content">
                <p className="umbrales-hint">
                  Cada umbral define desde qué nivel de concentración se aplica el color.
                  <span style={{ color: "var(--ink-3)" }}> 0 = zonas sin actividad · 1 = zona con mayor concentración</span>
                </p>
                
                {/* Barra de referencia visual del gradiente */}
                <div className="gradient-preview">
                  <span className="gradient-preview-label">Menor concentración</span>
                  <div className="gradient-bar">
                    {gradient.map((g, index) => (
                      <div 
                        key={index} 
                        className="gradient-segment"
                        style={{ backgroundColor: g.color }}
                        title={`${g.threshold.toFixed(2)} - ${getIntensityLabel(g.threshold)}`}
                      />
                    ))}
                  </div>
                  <span className="gradient-preview-label">Mayor concentración</span>
                </div>
                
                {gradient.map((g, index) => (
                  <div key={index} className="gradient-row">
                    <div 
                      className="color-swatch" 
                      style={{ backgroundColor: g.color }}
                      title={g.color}
                    />
                    <input
                      type="color"
                      value={g.color}
                      onChange={(e) => handleColorChange(index, e.target.value)}
                      className="color-picker"
                    />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={g.threshold}
                      onChange={(e) => handleThresholdChange(index, Number(e.target.value))}
                      className="threshold-slider"
                    />
                    <div className="threshold-info">
                      <span className="threshold-percent">{thresholdToPercent(g.threshold)}</span>
                      <span className="threshold-label">{getIntensityLabel(g.threshold)}</span>
                    </div>
                  </div>
                ))}
                
                <button className="reset-btn" onClick={resetGradient} style={{ marginTop: 12 }}>
                  Restablecer umbrales
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leyenda: traduce cada color a un rango de incidentes. Sin esto el mapa
          es bonito pero no se puede decir qué es crítico y qué no. */}
      {mode === "heat" && escala && escala.bandas.length > 0 && (
        <div className="heat-legend">
          <span className="heat-legend-title">
            Incidentes por cámara{umbralesManuales ? " · umbrales manuales" : ""}
          </span>
          <div className="heat-legend-bands">
            {escala.bandas.map((b) => (
              <span className="heat-band" key={b.etiqueta}>
                <span className="heat-band-dot" style={{ background: b.color }} />
                <b>{b.etiqueta}</b>
                <span className="heat-band-rango">
                  {b.desde === b.hasta ? nfMapa(b.desde) : `${nfMapa(b.desde)}–${nfMapa(b.hasta)}`}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="map-shell">
        <MapContainer center={CENTRO} zoom={ZOOM} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          {points.length > 0 && <FitBounds points={points} />}
          <MapResizer />
          {/* Con el top N las direcciones se encimaban (los focos están todos en
              el centro), así que sobre el mapa va solo el número y el detalle
              se lee en la leyenda de abajo o haciendo click. */}
          {/* Zonas de hover invisibles sobre el mapa de calor: leaflet.heat
              pinta un canvas sin objetos, así que no hay nada que "tocar".
              Estos círculos transparentes dan el mismo tooltip que las burbujas. */}
          {mode === "heat" && puntosOrdenados.map((p) => (
            <CircleMarker
              key={`hit-${p.dispositivo}`}
              center={[p.lat, p.lng]}
              radius={10}
              pathOptions={{ stroke: false, fill: true, fillOpacity: 0, className: "hit-calor" }}
            >
              <Tooltip direction="top" offset={[0, -6]} className="tooltip-critico" sticky>
                <b>{p.direccion}</b>
                <br />
                {nfMapa(p.cuenta)} incidente{p.cuenta === 1 ? "" : "s"}
              </Tooltip>
            </CircleMarker>
          ))}

          {mode === "heat" && puntosMarcados.map((p, i) => (
            <CircleMarker
              // la key incluye el modo: al alternar entre etiqueta completa y
              // chapita numerada, react-leaflet reutilizaba el marcador y el
              // tooltip del #1 quedaba sin volver a vincularse
              key={`${p.dispositivo}-${mostrarTop ? "top" : "solo"}`}
              center={[p.lat, p.lng]}
              radius={mostrarTop ? 11 : 9}
              pathOptions={{ color: "#111", weight: i === 0 ? 3 : 2, fillColor: "#fff", fillOpacity: 0.95 }}
            >
              {mostrarTop ? (
                <>
                  <Tooltip permanent direction="center" className="badge-top">{i + 1}</Tooltip>
                  <Popup>
                    <b>{i + 1}. {p.direccion}</b><br />
                    {nfMapa(p.cuenta)} incidente{p.cuenta === 1 ? "" : "s"}<br />
                    <span style={{ color: "#6b7a8d" }}>{p.dispositivo}</span>
                  </Popup>
                </>
              ) : (
                <Tooltip permanent direction="top" offset={[0, -10]} className="tooltip-critico">
                  <b>{p.direccion}</b>
                  <br />
                  {nfMapa(p.cuenta)} incidente{p.cuenta === 1 ? "" : "s"}
                </Tooltip>
              )}
            </CircleMarker>
          ))}
          {mode === "heat" && points.length > 0 && (
            <HeatLayer
              points={points} 
              blur={blur} 
              radius={radius} 
              intensity={intensity} 
              category={currentCategory}
              gradient={gradient}
            />
          )}
          {mode === "bubbles" &&
            points.map((p) => (
              <CircleMarker key={p.dispositivo} center={[p.lat, p.lng]} radius={radiusFor(p.count, max)}
                pathOptions={{ color: "#fff", weight: 1, fillColor: "var(--brand)", fillOpacity: 0.7 }}>
                <Popup>
                  <b>{p.direccion}</b><br />
                  {p.count} incidente{p.count === 1 ? "" : "s"}<br />
                  {/* el popup vive sobre el mapa claro, no sobre el tema oscuro */}
                  <span style={{ color: "#6b7a8d" }}>{p.dispositivo}</span>
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>
      </div>

      {/* Ranking legible: sobre el mapa solo va el número, acá el detalle. */}
      {mode === "heat" && mostrarTop && puntosMarcados.length > 0 && (
        <ol className="top-legend">
          {puntosMarcados.map((p, i) => (
            <li key={p.dispositivo}>
              <span className="top-rank">{i + 1}</span>
              <span className="top-dir" title={p.direccion}>{p.direccion}</span>
              <span className="top-num">{nfMapa(p.cuenta)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
