// DataUpload.jsx — vista de gestión de datos para gerentes de datos (ruta "/datos")
// Permite cargar archivos Excel, validar estructura y recargar datos

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchHealth } from "../api";
import { useDataVersion } from "../store/useDataVersion";

const nf = (n) => (n ?? 0).toLocaleString("es-AR");

// Mismo membrete que el dashboard (versión negativa sobre el navy).
function Topbar({ children }) {
  return (
    <header className="topbar">
      <div className="brand">
        <img
          className="logo"
          src="/logo-smt-negativo.png"
          alt="Ciudad SMT · Subsecretaría de Seguridad Ciudadana"
        />
        <span className="brand-divider" aria-hidden="true" />
        <h1>Gestión de Datos</h1>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>{children}</div>
    </header>
  );
}

export default function DataUpload() {
  const { increment } = useDataVersion();
  const [password, setPassword] = useState(() => sessionStorage.getItem("uploadToken") || "");
  const [isAuthenticated, setIsAuthenticated] = useState(!!sessionStorage.getItem("uploadToken"));
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [health, setHealth] = useState(null);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState(null);

  useEffect(() => {
    loadHealth();
  }, []);

  const loadHealth = async () => {
    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch (err) {
      console.error("Error loading health:", err);
      setHealth({ __error: err.message || "No se pudo consultar el estado" });
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (password.trim()) {
      sessionStorage.setItem("uploadToken", password.trim());
      setIsAuthenticated(true);
    }
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("uploadToken");
    setPassword("");
    setIsAuthenticated(false);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    const validExtensions = [".xlsx", ".xls"];
    const fileName = selectedFile.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValid) {
      setUploadError("Solo se aceptan archivos .xlsx o .xls");
      setFile(null);
      return;
    }
    
    setUploadError(null);
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = sessionStorage.getItem("uploadToken");
      const headers = {};
      if (token) {
        headers["x-upload-token"] = token;
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setUploadError("Contraseña incorrecta. Por favor, verificá la clave.");
          setIsAuthenticated(false);
          sessionStorage.removeItem("uploadToken");
        } else {
          setUploadError(data.error || "Error al subir el archivo");
        }
        return;
      }

      setUploadSuccess(true);
      setFile(null);
      increment();
      await loadHealth();
    } catch (err) {
      setUploadError("Error de conexión al subir el archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    setReloadError(null);

    try {
      const token = sessionStorage.getItem("uploadToken");
      const headers = {};
      if (token) {
        headers["x-upload-token"] = token;
      }

      const res = await fetch("/api/reload", {
        method: "POST",
        headers,
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setReloadError("Contraseña incorrecta");
          setIsAuthenticated(false);
          sessionStorage.removeItem("uploadToken");
        } else {
          setReloadError(data.error || "Error al recargar los datos");
        }
        return;
      }

      increment();
      await loadHealth();
    } catch (err) {
      setReloadError("Error de conexión al recargar");
    } finally {
      setReloading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // El backend avisa si el deploy tiene disco de escritura. En Vercel no lo
  // tiene, así que la carga de Excel se oculta en vez de fallar al enviar.
  const cargaHabilitada = health?.cargaHabilitada !== false;

  if (!health) {
    return (
      <div className="app">
        <Topbar>
          <Link to="/" className="btn">Volver al dashboard</Link>
        </Topbar>
        <main className="canvas">
          <div className="state">
            <div className="spinner" />
            <div className="big">Consultando el estado de los datos…</div>
          </div>
        </main>
      </div>
    );
  }

  if (!isAuthenticated && cargaHabilitada) {
    return (
      <div className="app">
        <Topbar>
          <Link to="/" className="btn">Volver al dashboard</Link>
        </Topbar>

        <main className="canvas">
          <div className="panel" style={{ maxWidth: "400px", margin: "40px auto" }}>
            <h3>Autenticación requerida</h3>
            <p className="panel-sub">Ingresá la clave de gestión de datos</p>
            <form onSubmit={handlePasswordSubmit}>
              <div className="field">
                <label>Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="Ingresá la clave..."
                  autoFocus
                />
              </div>
              <button type="submit" className="btn primary" style={{ width: "100%", marginTop: "12px" }}>
                Acceder
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Topbar>
        {cargaHabilitada && (
          <button onClick={handleLogout} className="btn">Cerrar sesión</button>
        )}
        <Link to="/" className="btn primary">Volver al dashboard</Link>
      </Topbar>

      <main className="canvas">
        {!cargaHabilitada && (
          <div className="banner-warning" style={{ marginBottom: 20 }}>
            <strong>La carga de Excel está deshabilitada en este entorno.</strong>
            <br />
            Este deploy corre sobre un disco de solo lectura, así que el archivo
            viaja dentro de la publicación. Para actualizar los datos hay que
            reemplazar <code>server/data/incidentes.xlsx</code> y volver a
            desplegar. Abajo podés verificar qué base está cargada ahora.
          </div>
        )}

        {/* --- Zona de carga --- */}
        {cargaHabilitada && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <h3>Carga de archivo Excel</h3>
          <p className="panel-sub">Subí el archivo con la hoja de incidentes y la de coordenadas de cámaras</p>
          
          <div
            className={`upload-zone ${dragActive ? "drag-active" : ""}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-upload"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <label htmlFor="file-upload" className="upload-label">
              <div className="upload-icon">📁</div>
              <div className="upload-text">
                Arrastrá el archivo acá o <span>hacé clic para seleccionar</span>
              </div>
              <div className="upload-hint">Solo .xlsx o .xls</div>
            </label>
          </div>

          {file && (
            <div className="file-info">
              <span className="file-name">{file.name}</span>
              <span className="file-size">{formatFileSize(file.size)}</span>
              <button onClick={() => setFile(null)} className="btn" style={{ padding: "6px 10px" }}>✕</button>
            </div>
          )}

          {uploadError && (
            <div className="banner-error" style={{ marginTop: 16 }}>
              {uploadError}
            </div>
          )}

          {uploadSuccess && (
            <div className="banner-success" style={{ marginTop: 16 }}>
              ✓ Archivo subido correctamente. Los datos han sido actualizados.
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="btn primary"
            style={{ marginTop: 16, width: "100%" }}
          >
            {uploading ? "Subiendo..." : "Subir y actualizar"}
          </button>
        </section>
        )}

        {/* --- Panel de validación --- */}
        {!health.__error && (
          <section className="panel" style={{ marginBottom: 20 }}>
            <h3>Validación de datos</h3>
            <p className="panel-sub">Estado actual de la base de datos</p>

            <div className="validation-grid">
              <div className="validation-item">
                <label>Fecha última carga</label>
                <div className="validation-value">{formatDate(health.loadedAt)}</div>
              </div>

              <div className="validation-item">
                <label>Total registros</label>
                <div className="validation-value">{nf(health.totalRegistros)}</div>
              </div>

              <div className="validation-item">
                <label>Hoja de incidentes</label>
                <div className={`validation-value ${health.meta?.hojaIncidentes ? "valid" : "invalid"}`}>
                  {health.meta?.hojaIncidentes || "No detectada"}
                </div>
              </div>

              <div className="validation-item">
                <label>Hoja de cámaras</label>
                <div className={`validation-value ${health.meta?.hojaCamaras ? "valid" : "invalid"}`}>
                  {health.meta?.hojaCamaras || "No detectada"}
                </div>
              </div>

              <div className="validation-item">
                <label>Registros reales</label>
                <div className="validation-value">{nf(health.meta?.registrosReales)}</div>
              </div>

              <div className="validation-item">
                <label>Filas vacías</label>
                <div className="validation-value">{nf(health.meta?.filasVacias)}</div>
              </div>

              <div className="validation-item">
                <label>Incidentes sin cámara</label>
                <div className={`validation-value ${health.meta?.incidentesSinCamara > 0 ? "warning" : "valid"}`}>
                  {nf(health.meta?.incidentesSinCamara)}
                </div>
              </div>
            </div>

            {/* --- Mapeo de columnas --- */}
            <div style={{ marginTop: 20 }}>
              <h4 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 12px" }}>Columnas detectadas</h4>
              
              <div className="column-mapping">
                <div className="column-section">
                  <label>Hoja de incidentes</label>
                  <div className="column-list">
                    {Object.entries(health.meta?.columnasBD || {}).map(([key, value]) => (
                      <div key={key} className={`column-item ${value ? "valid" : "invalid"}`}>
                        <span className="column-key">{key}</span>
                        <span className="column-value">{value || "❌ No encontrada"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="column-section">
                  <label>Hoja de cámaras</label>
                  <div className="column-list">
                    {Object.entries(health.meta?.camaras?.columnas || {}).map(([key, value]) => (
                      <div key={key} className={`column-item ${value ? "valid" : "invalid"}`}>
                        <span className="column-key">{key}</span>
                        <span className="column-value">{value || "❌ No encontrada"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {health.meta?.incidentesSinCamara > 0 && (
              <div className="banner-warning" style={{ marginTop: 16 }}>
                ⚠️ Hay <strong>{nf(health.meta.incidentesSinCamara)}</strong> dispositivos en la base de datos sin cámara asociada.
                Agregá estos IDs a <code>ID_FIXES</code> en <code>server/excelReader.js</code> para corregir el mapeo.
              </div>
            )}
          </section>
        )}

        {/* --- Recarga manual --- */}
        {cargaHabilitada && (
        <section className="panel">
          <h3>Recarga manual</h3>
          <p className="panel-sub">Si reemplazaste el archivo manualmente en el servidor</p>
          
          {reloadError && (
            <div className="banner-error" style={{ marginBottom: 12 }}>
              {reloadError}
            </div>
          )}

          <button
            onClick={handleReload}
            disabled={reloading}
            className="btn"
            style={{ width: "100%" }}
          >
            {reloading ? "Recargando..." : "Recargar datos"}
          </button>
        </section>
        )}
      </main>
    </div>
  );
}
