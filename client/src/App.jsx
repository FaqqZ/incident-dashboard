// App.jsx — ruteo. La raíz es el selector de área (caso de estudio) y cada área
// cuelga de su propio prefijo, así sumar Defensa Civil o la Patrulla es agregar
// sus rutas sin tocar las del COMM.
//
// Las tres áreas ya tienen tablero, así que AreaPendiente.jsx quedó sin uso:
// se conserva para cuando entre un área nueva sin base todavía.

import { Routes, Route, Navigate } from "react-router-dom";
import SelectorArea from "./components/SelectorArea";
import Dashboard from "./components/Dashboard";
import PPCDashboard from "./components/PPCDashboard";
import DCDashboard from "./components/DCDashboard";
import SiniestrosViales from "./components/SiniestrosViales";
import AnalisisCategoria from "./components/AnalisisCategoria";
import DataUpload from "./components/DataUpload";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SelectorArea />} />

      {/* --- Centro Operativo de Monitoreo Municipal --- */}
      <Route path="/comm" element={<Dashboard />} />
      <Route path="/comm/siniestros-viales" element={<SiniestrosViales />} />
      <Route path="/comm/analisis" element={<AnalisisCategoria />} />
      <Route path="/comm/datos" element={<DataUpload />} />

      {/* --- Áreas cuya base llega ya agregada por mes --- */}
      {/* Ninguna de las dos lleva mapa ni subrutas: sin domicilio ni
          coordenadas no hay nada que georreferenciar. */}
      <Route path="/ppc" element={<PPCDashboard />} />
      <Route path="/defensa-civil" element={<DCDashboard />} />

      {/* Rutas viejas: antes el COMM colgaba de la raíz. Se redirigen para no
          romper enlaces ya compartidos. */}
      <Route path="/siniestros-viales" element={<Navigate to="/comm/siniestros-viales" replace />} />
      <Route path="/analisis" element={<Navigate to="/comm/analisis" replace />} />
      <Route path="/datos" element={<Navigate to="/comm/datos" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
