// IncidentMap.jsx — mapa de incidentes agregados por cámara.
// Dos modos: calor (peso = cantidad de incidentes) y burbujas (tamaño = cantidad),
// replicando el mapa de Power BI con Size = Recuento de dispositivo.

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

const CENTRO = [-26.8241, -65.2226]; // San Miguel de Tucumán
const ZOOM = 13;

// Valores por defecto para los sliders
const DEFAULT_BLUR = 15;
const DEFAULT_RADIUS = 30;
const DEFAULT_INTENSITY = 60;

// Umbrales y colores por defecto para el gradiente.
// Calibrados para el mapa CLARO: el resto del tablero es oscuro, pero el mapa
// se mantiene con tiles claros a propósito.
const DEFAULT_GRADIENT = [
  { threshold: 0.2, color: "#2f6f8f" },
  { threshold: 0.4, color: "#4c9f70" },
  { threshold: 0.6, color: "#e0a458" },
  { threshold: 0.8, color: "#ed7d31" },
  { threshold: 1.0, color: "#d1495b" },
];

// Cómo se traduce la cantidad de incidentes a "peso" del punto:
const COUNT_CEIL = 35;        // conteos >= a esto ya son intensidad máxima (bajalo para saturar antes)
const WEIGHT_MIN = 0.25;      // peso mínimo, para que hasta 1 incidente se note
const HEAT_MIN_OPACITY = 0.4; // PISO: intensidad mínima visible

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
    
    // peso por punto: según categoría seleccionada o total
    const heatData = points
      .map((p) => {
        const count = category && category !== "all" 
          ? (p.porCategoria?.[category] || 0)
          : p.count;
        if (count === 0) return null; // Excluir puntos sin incidentes de esta categoría
        const w = WEIGHT_MIN + (1 - WEIGHT_MIN) * Math.min(count, COUNT_CEIL) / COUNT_CEIL;
        return [p.lat, p.lng, w];
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
  const [categoryMode, setCategoryMode] = useState("auto"); // "auto" = seguir principal, "manual" = selección manual
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [gradient, setGradient] = useState(DEFAULT_GRADIENT);
  const [showUmbrales, setShowUmbrales] = useState(false);
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

  const resetGradient = () => {
    setGradient(DEFAULT_GRADIENT.map((g) => ({ ...g })));
  };

  const handleThresholdChange = (index, newValue) => {
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
    <div>
      <div className="map-toggle" role="tablist" aria-label="Modo de mapa">
        <button className={mode === "heat" ? "active" : ""} onClick={() => setMode("heat")}
          role="tab" aria-selected={mode === "heat"}>Mapa de calor</button>
        <button className={mode === "bubbles" ? "active" : ""} onClick={() => setMode("bubbles")}
          role="tab" aria-selected={mode === "bubbles"}>Burbujas</button>
      </div>

      {mode === "heat" && (
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

      <div className="map-shell">
        <MapContainer center={CENTRO} zoom={ZOOM} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          {points.length > 0 && <FitBounds points={points} />}
          <MapResizer />
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
    </div>
  );
}
