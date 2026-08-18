// App.jsx — ruteo entre la vista ejecutiva (Dashboard), el mapa de siniestros
// viales (SiniestrosViales) y la gestión de datos (DataUpload).

import { Routes, Route } from "react-router-dom";
import Dashboard from "./components/Dashboard";
import SiniestrosViales from "./components/SiniestrosViales";
import DataUpload from "./components/DataUpload";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/siniestros-viales" element={<SiniestrosViales />} />
      <Route path="/datos" element={<DataUpload />} />
    </Routes>
  );
}
