// ExportButton.jsx — exporta el tablero a PDF con html2canvas + jsPDF.
// Captura el nodo #export-area y lo encaja en una hoja A4 horizontal.

import { useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export default function ExportButton({ targetId = "export-area", filename }) {
  const [busy, setBusy] = useState(false);

  async function exportPdf() {
    const node = document.getElementById(targetId);
    if (!node) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#0b1a2e", // --bg, para que el PDF salga igual que la pantalla
        // los tiles del mapa pueden fallar por CORS; se ignoran sin romper
        ignoreElements: (el) => el.classList?.contains("no-export"),
      });

      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      // margen y escalado proporcional
      const margin = 24;
      const availW = pageW - margin * 2;
      const ratio = canvas.height / canvas.width;
      let w = availW;
      let h = availW * ratio;
      if (h > pageH - margin * 2) {
        h = pageH - margin * 2;
        w = h / ratio;
      }
      const x = (pageW - w) / 2;
      pdf.addImage(img, "PNG", x, margin, w, h);

      const stamp = new Date().toISOString().slice(0, 10);
      pdf.save(filename || `panel-incidentes-${stamp}.pdf`);
    } catch (err) {
      alert("No se pudo generar el PDF: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn primary no-export" onClick={exportPdf} disabled={busy}>
      {busy ? "Generando…" : "Exportar PDF"}
    </button>
  );
}
