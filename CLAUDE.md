# Panel Operativo de Incidentes — contexto para Claude Code

Dashboard web que reemplaza un tablero de Power BI de Seguridad Ciudadana
(Municipalidad de San Miguel de Tucumán). Backend Node/Express + SheetJS que lee
un Excel y sirve datos agregados; frontend React (Vite) + Leaflet + Recharts.

## Estructura
- `server/` — API. `index.js` (endpoints), `excelReader.js` (lectura + cruce +
  medidas), `generateSample.js` (datos de prueba).
- `client/` — React.
  - `App.jsx` es SOLO el router: `/` → `components/Dashboard.jsx`,
    `/datos` → `components/DataUpload.jsx`. La vista ejecutiva (KPIs, mapa,
    gráficos) se arma en **Dashboard.jsx**, no en App.jsx.
  - `components/` — KPIs, mapa, gráficos.
  - `store/useFilters.js` — estado de filtros compartido (cross-filter).
  - `hooks/useNarrowScreen.js` — breakpoint 900px en JS. Los ejes de Recharts se
    miden en px fijos, así que el CSS solo no alcanza para el layout responsive.

## Modelo de datos
El Excel `server/data/incidentes.xlsx` tiene DOS hojas. Los nombres reales están
mal escritos y NO coinciden con los del Power BI original; las hojas se detectan
por coincidencia parcial en `findSheetName`, así que igual funciona:

- **`Base-EaJ`** (incidentes, una fila = un incidente) — detectada por "base".
  Columnas: `fecha`, `detalle`, `usuario`, `turno`, `dispositivo`, `ubicación`,
  `naturaleza`, `categoria`, `subcategoria`.
  29.114 filas, 0 vacías. `detalle`, `usuario`, `ubicación` y `subcategoria`
  hoy NO se usan.
- **`Coordendas-Cámaras`** (sic, sin la "e") — detectada por "cámaras".
  494 cámaras, 0 sin coordenadas. Columnas: `id`, `DIRECCION`,
  `COORDENADAS` (texto "-26.836, -65.206").

CLAVE: la posición en el mapa NO sale de columnas de coordenadas en la hoja de
incidentes, sino de la relación **incidentes[dispositivo] → cámaras[id]**. En
Power BI era la línea de relación; acá es un cruce en `excelReader.js`.

### ⚠️ naturaleza: la base de hoy es más amplia que la del Power BI
La columna `naturaleza` tiene dos valores: **Seguridad (2.009)** y
**Municipal (27.105)**. El tablero de Power BI original miraba SOLO las de
Seguridad — por eso su total era 2009.

Hoy el dashboard abre sin filtrar, mostrando las 29.114. No es un error de
cálculo: con `naturaleza=Seguridad` todos los valores históricos coinciden al
dígito (ver Validación). Si el objetivo es replicar el Power BI, hay que
arrancar con ese filtro puesto (`EMPTY` en `store/useFilters.js`).

## Correcciones de Power Query implementadas (excelReader.js)
- Filtrar dispositivo vacío/nulo en la hoja de incidentes.
- fecha → tipo fecha; columnas mes (nombre español), mesnro (orden ene→jul),
  clase (primeras 3 letras del dispositivo: CAM/DOM).
- Fix de id: "DO-001" → "DOM001" (objeto ID_FIXES, ampliable).
- Split de COORDENADAS en lat/long numéricas.
- DIRECCION a mayúscula inicial respetando conectores en español.

## Medidas DAX traducidas
Total incidentes, Categoría Top, Turno Top, Punto Top (DIRECCION con más casos),
Punto Top de la Categoría Principal. Todas responden a los filtros activos.

## Filtros
`categoria`, `turno`, `naturaleza`, `mes`, `clase` y rango `from`/`to`.
Se propagan como query params a `/api/dashboard` y se llenan desde
`/api/options`. El cross-filter (click en barra de categoría, sector de turno)
usa el mismo store. `RankingChart` NO tiene onClick: sus barras no filtran.

## Cómo correrlo
- Backend:  `cd server && npm start`  (API en http://localhost:4000)
- Frontend: `cd client && npm run dev` (http://localhost:5173)

⚠️ **El backend NO tiene hot-reload.** Node cachea los módulos al arrancar: si
editás `excelReader.js` o `index.js`, hay que reiniciar el proceso o los cambios
no se ven. Síntoma típico: la API devuelve una respuesta sin los campos nuevos
mientras el archivo en disco sí los tiene. Para descartarlo, comparar la API
contra el módulo cargado en fresco:

```bash
cd server && node -e "const R=require('./excelReader');const{records,meta}=R.loadIncidents('data/incidentes.xlsx');console.log(meta.columnasBD);console.log(Object.keys(R.buildFilterOptions(records)))"
```

⚠️ NO correr `npm run sample`: SOBRESCRIBE server/data/incidentes.xlsx con datos
ficticios. Solo se usa una vez, sin datos reales. Si el archivo de data/ tiene
direcciones inventadas (ej. "San Martín 729"), es el ejemplo, no la base real.

## Validación con el Excel real
Abrir http://localhost:4000/api/health y verificar:
- hojaIncidentes="Base-EaJ", hojaCamaras="Coordendas-Cámaras"
- columnasBD y camaras.columnas sin null (columnasBD debe incluir `naturaleza`)
- registrosReales = 29114, filasVacias = 0
- camaras.camaras = 494, sinCoordenadas = 0
- incidentesSinCamara = 1 → es **DOM100**, que directamente no figura en la hoja
  de cámaras (hueco en la secuencia: van DOM099 y DOM101). NO se arregla con
  ID_FIXES; hace falta que Seguridad Ciudadana cargue esa cámara.

Valores conocidos del Power BI — se reproducen con
http://localhost:4000/api/dashboard?naturaleza=Seguridad (verificado 2026-08-09,
coinciden los 11):
- Total: 2009
- Categorías: Siniestros Viales 498, 911 472, Post Siniestros Viales 203,
  Personas 131, Totems 120, Violencia 114
- Turnos: tarde 733, noche 596, mañana 585, intermedio 95
- Punto con más incidentes: Av. Benjamin Araoz 730 (DOM035), 52 casos

Sin ese filtro los números son otros (total 29.114, categoría top TRÁNSITO. con
18.303) y eso es lo esperado.

## Otros datos de la base actual
- 29 categorías distintas (la lista NO viene limitada por el backend: los
  gráficos de barras horizontales tienen que ponerle techo al alto).
- Turnos: intermedio, mañana, noche, tarde.
- Clases: CAM, DOM.
- Rango de fechas: 2026-01-01 → 2026-07-31 (enero a julio).

## Pendiente para producción
Login de usuarios, seguridad por filas (RLS), refresco automático del Excel
(hoy la carga mensual es manual o por POST /api/upload).
