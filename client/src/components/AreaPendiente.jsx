// AreaPendiente.jsx — vista de un área todavía sin base de datos.
//
// Existe para que la ruta del área no sea un 404 y para dejar explícito qué
// hace falta para activarla. Cuando llegue el Excel, esta vista se reemplaza
// por el tablero del área.

import { Link } from "react-router-dom";

export default function AreaPendiente({ nombre, sigla, archivo }) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="logo" src="/logo-smt-negativo.png"
            alt="Ciudad SMT · Subsecretaría de Seguridad Ciudadana" />
          <span className="brand-divider" aria-hidden="true" />
          <h1>{nombre}</h1>
        </div>
        <Link to="/" className="btn">Volver al inicio</Link>
      </header>

      <main className="canvas">
        <section className="panel" style={{ maxWidth: 720, margin: "40px auto" }}>
          <h3>Todavía no hay datos de {sigla}</h3>
          <p className="panel-sub">
            La estructura del tablero ya está: falta la base de datos del área.
          </p>

          <div className="banner-warning">
            Para activarla hace falta el Excel del área en{" "}
            <code>server/data/{archivo}</code>, con una hoja de registros y otra
            de ubicaciones (o el campo de coordenadas correspondiente).
            <br />
            <br />
            Cuando esté, se define qué indicadores tiene sentido calcular: no
            necesariamente son los mismos del COMM, porque el trabajo de
            Defensa Civil y el de la Patrulla se miden distinto.
          </div>

          <Link to="/comm" className="btn primary" style={{ marginTop: 16, display: "inline-block" }}>
            Ir al tablero del COMM
          </Link>
        </section>
      </main>
    </div>
  );
}
