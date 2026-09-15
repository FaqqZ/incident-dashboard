// TopBar.jsx — encabezado único de todas las vistas.
//
// Antes cada vista armaba el suyo: el del COMM llegó a tener cinco botones
// sueltos en la barra y los de la Patrulla y Defensa Civil, uno solo. Se veían
// como tableros distintos en vez de como el mismo sistema.
//
// Ahora todas tienen la misma forma —membrete, título, resumen y menú— y lo
// que cambia entre vistas son los ítems del menú, que van escondidos detrás del
// botón hamburguesa. Así la barra no crece con la cantidad de secciones.

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

export default function TopBar({ titulo, resumen, menu = [], acciones = null }) {
  const [abierto, setAbierto] = useState(false);
  const cajaRef = useRef(null);
  const { pathname } = useLocation();

  // Al navegar, el menú se cierra solo: si no, queda abierto sobre la vista nueva.
  useEffect(() => setAbierto(false), [pathname]);

  useEffect(() => {
    if (!abierto) return;
    const afuera = (e) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target)) setAbierto(false);
    };
    const tecla = (e) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const hayMenu = menu.length > 0 || Boolean(acciones);

  return (
    <header className="topbar">
      <div className="brand">
        {/* Versión negativa del membrete: el original tiene el texto en negro
            y sobre el navy no se lee. logo-smt.png guarda el archivo intacto. */}
        <img
          className="logo"
          src="/logo-smt-negativo.png"
          alt="Ciudad SMT · Subsecretaría de Seguridad Ciudadana"
        />
        <span className="brand-divider" aria-hidden="true" />
        <h1>{titulo}</h1>
      </div>

      <div className="topbar-acciones">
        {resumen && <span className="updated">{resumen}</span>}

        {hayMenu && (
          <div className="menu-caja" ref={cajaRef}>
            <button
              type="button"
              className={`menu-boton${abierto ? " abierto" : ""}`}
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
              aria-haspopup="true"
              aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
            >
              <span className="menu-rayas" aria-hidden="true">
                <i /><i /><i />
              </span>
              Menú
            </button>

            {abierto && (
              <div className="menu-panel" role="menu">
                {menu.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    role="menuitem"
                    className={`menu-item${pathname === item.to ? " actual" : ""}`}
                  >
                    {item.label}
                  </Link>
                ))}
                {acciones && <div className="menu-separador" />}
                {acciones}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
