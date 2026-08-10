// App.jsx — ruteo entre vista ejecutiva (Dashboard) y gestión de datos (DataUpload)

import { Routes, Route } from "react-router-dom";
import Dashboard from "./components/Dashboard";
import DataUpload from "./components/DataUpload";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/datos" element={<DataUpload />} />
    </Routes>
  );
}
