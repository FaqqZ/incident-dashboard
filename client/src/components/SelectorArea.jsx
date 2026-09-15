// SelectorArea.jsx — pantalla de inicio (ruta "/").
//
// El tablero dejó de ser exclusivo del COMM: acá se elige a qué caso de estudio
// de la Subsecretaría entrar. Las áreas y su estado vienen de /api/areas, así
// que la pantalla dice la verdad sobre qué base está cargada y cuál falta, en
// vez de tener las tres tarjetas escritas a mano.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TopBar from "./TopBar";
import { fetchAreas } from "../api";

const nf = (n) => (n ?? 0).toLocaleString("es-AR");

export default function SelectorArea() {
  const [areas, setAreas] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAreas()
      .then((d) => { setAreas(d.areas); setError(null); })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="app">
      {/* La portada no lleva menú: elegir el área ES el menú. */}
      <TopBar titulo="Tableros de Seguridad Ciudadana" />

      <main className="canvas">
        <div className="portada">
          <h2>Elegí un caso de estudio</h2>
          <p>
            Cada área tiene su propia base de datos y sus propios indicadores.
            Empezá por la que quieras analizar.
          </p>
        </div>

        {error && (
          <div className="banner-error">
            No se pudieron cargar las áreas: {error}. Revisá que el servidor esté corriendo.
          </div>
        )}

        {!areas && !error && (
          <div className="state"><div className="spinner" /><div className="big">Cargando áreas…</div></div>
        )}

        {areas && (
          <section className="areas-grid">
            {areas.map((a) => {
              const contenido = (
                <>
                  {/* El escudo del área, si lo tiene. Las que no (el COMM usa
                      el membrete institucional) quedan solo con la sigla. */}
                  <div className="area-marca">
                    {a.logo ? (
                      // El escudo ya lleva la sigla adentro: repetirla al lado
                      // la mostraría dos veces.
                      <img className="area-logo" src={a.logo} alt={`Escudo de ${a.nombre}`} />
                    ) : (
                      <span className="area-sigla">{a.sigla}</span>
                    )}
                  </div>
                  <h3>{a.nombre}</h3>
                  <p>{a.descripcion}</p>
                  <span className={`area-estado ${a.listo ? "ok" : "pendiente"}`}>
                    {/* "en la base" y no "cargados": la unidad de cada área
                        cambia de género (incidentes / intervenciones). */}
                    {a.listo
                      ? `${nf(a.registros)} ${a.unidad || "registros"} en la base`
                      : a.error
                        ? "Con errores en la base"
                        : "Sin base de datos todavía"}
                  </span>
                </>
              );

              // Las áreas sin datos no son un enlace roto: son una tarjeta
              // apagada que explica qué falta.
              return a.listo ? (
                <Link key={a.id} to={`/${a.id}`} className="area-card">
                  {contenido}
                  <span className="area-cta">Entrar →</span>
                </Link>
              ) : (
                <div key={a.id} className="area-card deshabilitada" aria-disabled="true">
                  {contenido}
                  <span className="area-cta">Pendiente</span>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
