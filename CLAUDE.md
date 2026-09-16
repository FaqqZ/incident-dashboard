# Panel Operativo de Incidentes — contexto para Claude Code

Dashboard web que reemplaza un tablero de Power BI de Seguridad Ciudadana
(Municipalidad de San Miguel de Tucumán). Backend Node/Express + SheetJS que lee
un Excel y sirve datos agregados; frontend React (Vite) + Leaflet + Recharts.

## Áreas (casos de estudio)
El tablero dejó de ser exclusivo del COMM. La raíz `/` es un **selector de
área** y cada área cuelga de su prefijo. Se declaran en `server/areas.js`, que
además marca `disponible` según exista o no su Excel en `DATA_DIR`.

| Área | Ruta | Excel | Estado |
|---|---|---|---|
| Centro Operativo de Monitoreo Municipal | `/comm` | `incidentes.xlsx` + `siniestralidad.xlsx` | completo (con mapa) |
| Patrulla de Protección Ciudadana | `/ppc` | `ppc.xlsx` | completo (**sin mapa**) |
| Defensa Civil | `/defensa-civil` | `defensa-civil.xlsx` | completo (**sin mapa**) |

**El COMM es la única con mapa.** Las otras dos reciben la base ya agregada por
mes, sin domicilio ni coordenadas: no hay nada que georreferenciar. Por eso
tampoco tienen filtro de fechas por día, turno ni franja horaria — la unidad
mínima de su dato es el mes.

Las áreas NO comparten modelo de datos ni medidas: cada una tiene su lector y
sus endpoints. Lo único común son los componentes de gráfico y `chartTheme`.

**Escudo del área**: `logoArchivo` en `areas.js` nombra un PNG de
`client/public/`. `/api/areas` devuelve `logo` solo si el archivo existe, así
que alcanza con dejarlo ahí para que la tarjeta lo muestre (y sin él usa la
sigla, sin pedir un 404). Hoy están `logo-comm.png`, `logo-ppc.png` y
`logo-dc.png`.
El del COM llegó con tinta NEGRA sobre blanco: sobre el navy el "COM" no se
veía. Se pasó a negativo con `node scripts/quitarFondo.js entrada.png salida.png
negativo 40` (el blanco se vuelve transparencia, la tinta neutra pasa a blanco y
los arcos azul y dorado conservan su color). Es apaisado, por eso `.area-logo`
tiene `max-width: 100px`: con el tope anterior quedaba más bajo que los escudos.
⚠️ Tiene que ser **PNG con fondo transparente**: las tarjetas son navy oscuro y
un fondo opaco deja un cuadrado blanco o negro alrededor del escudo. Ninguno de
los dos vino así (ver [`brand/README.md`](brand/README.md)); se limpiaron con
`scripts/quitarFondo.js`. Los masters transparentes quedaron en `brand/`, así
que reexportar a otro tamaño no depende de los archivos originales.

## Estructura
- `server/` — API.
  - `index.js` (endpoints), `areas.js` (registro de áreas).
  - `excelReader.js` — COMM: lectura + cruce con cámaras + medidas.
  - `ppcReader.js` — PPC: matriz mensual + medidas.
  - `generateSample.js` (datos de prueba).
- `client/` — React.
  - `App.jsx` es SOLO el router. Las vistas se arman en `components/`:
    `SelectorArea.jsx` (`/`), `Dashboard.jsx` (`/comm`),
    `PPCDashboard.jsx` (`/ppc`), `DataUpload.jsx` (`/comm/datos`).
    La vista ejecutiva del COMM está en **Dashboard.jsx**, no en App.jsx.
  - `components/` — KPIs, mapa, gráficos.
  - `TopBar.jsx` — **encabezado único de TODAS las vistas**. Ninguna arma el
    suyo. Recibe `titulo`, `resumen` y `menu` (los enlaces, que van detrás del
    botón hamburguesa) más `acciones` para botones sueltos como el de exportar.
    Antes cada vista tenía su barra: el COMM llegó a cinco botones en línea y
    la Patrulla tenía uno, con lo cual se veían como sistemas distintos.
  - `KpiCard.jsx` — baja el cuerpo del valor según su largo (>9 → 24px,
    >20 → 19px). Sin eso, valores como "Prevencion" o "Defensa Civil
    Municipal" se parten al medio de la palabra contra el borde de la tarjeta.
  - **Compartidos por PPC y Defensa Civil** (las dos áreas sin mapa):
    `BarrasPorTipo.jsx` (barras con selección), `MiniSeries.jsx` (un mini
    gráfico por serie, cada uno con su escala) y `MatrizMesTipo.jsx` (tabla
    mes × tipo). Antes se llamaban `PPC*`; se renombraron al sumarse DC.
  - **Solo Defensa Civil**: `TortaDistribucion.jsx` (anillo con leyenda
    clickeable) y `EvolucionApilada.jsx` (áreas apiladas por mes). DC usa
    estos y NO las barras/matriz de la Patrulla, a propósito: la pregunta acá
    es qué parte del total se lleva cada categoría y si esa mezcla se movió,
    mientras que la Patrulla rankea nueve tipos y para eso las barras sirven
    mejor. En los dos, la porción o capa más grande va en amarillo.
  - `chartTheme.jsx` — regla de paleta: el máximo SIEMPRE en amarillo
    (`--color-1`), el resto en azul. Vale para todos los gráficos con un máximo.
    También define los degradés y el halo del máximo en `defsGrafico(ids)`.
    ⚠️ **`defsGrafico` NO es un componente y no se usa como `<DefsGrafico />`.**
    Recharts filtra los hijos de un gráfico por tipo y descarta los que son
    componentes propios: se ve un `<defs>` en el DOM (el de Recharts) pero
    vacío, y todo lo que referencie `url(#…)` queda sin relleno. Por eso se
    INVOCA — `{defsGrafico(ids)}` — para que Recharts reciba el elemento
    directo. Los id salen de `useIdsGrafico()`, uno por instancia, porque los
    id de `<defs>` son globales al documento.
    Las transiciones van en CSS, NO en las animaciones de Recharts: esas
    siguen apagadas porque los puntos y las etiquetas de valor recién se
    dibujan cuando la animación termina y quedaban invisibles.
  - `store/useFilters.js` — filtros del COMM (cross-filter). La PPC NO lo usa:
    tiene sus propios filtros en estado local, porque no comparte campos.
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

## Capas territoriales del mapa (COMM)
El mapa de puntos (`RecurrenciaMap.jsx`, usado en `/comm`, en el análisis por
categoría y en siniestros viales) tiene tres capas opcionales:
**Distritos** (20), **Circuitos electorales** (47) y **Barrios y zonas** (362).
Lógica en `CapasTerritoriales.jsx`.

- Arrancan apagadas; cada una se prende con su botón en la barra del mapa y la
  elección se recuerda en el navegador (`localStorage`, clave
  `comm.capasActivas`). Los GeoJSON se piden recién al prenderlas.
- **Filtros por distrito, circuito y barrio**: un desplegable por capa en la
  fila "Filtrar", y el clic sobre un polígono elige ese mismo valor (segundo
  clic lo suelta). Se COMBINAN: quedan los puntos que caen dentro de todos los
  polígonos elegidos (punto-en-polígono con la ubicación de la cámara) y el
  máximo pasa a ser el de esa zona. Elegir un valor prende su capa; apagar la
  capa suelta su filtro. La lista de barrios se acota al distrito/circuito
  elegido (según la asignación de la auditoría) y, si el barrio elegido no
  pertenece al distrito o circuito nuevo, se suelta. Las listas se piden al
  tocar el desplegable. Filtra SOLO el mapa: los KPI y gráficos de la vista no
  cambian.
- Con varias capas prendidas, solo la más fina lleva relleno; las otras quedan
  como contorno (si no, el relleno del distrito tapaba el clic a los barrios).
- Van en panes propios con z-index 360–380, debajo de los puntos (400).

Los archivos servidos están en `client/public/capas/` y salen de:

```bash
node scripts/convertirCapas.js "DISTRITOS PP CORREGIDO.geojson" circuitos_electorales_2027.geojson Barrios_y_Zonas_2026_AUDITADO.geojson
```

⚠️ Circuitos y barrios llegaron en **EPSG:5345** (POSGAR 2007 / Argentina
faja 3, en metros); Leaflet necesita lat/lng. El script los reproyecta (sin
dependencias), aplana los `GeometryCollection`, redondea a 6 decimales y deja
solo los campos del tooltip. Distritos ya venía en CRS84. Verificación hecha
al convertir: los 241 barrios que la auditoría asigna 100% a un distrito caen
dentro de ese distrito, y los 222 asignados 100% a un circuito, dentro del
suyo. Con la base actual, 481 de las 485 cámaras caen en algún distrito
(Distrito 10, el centro, tiene 337).

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

## Patrulla de Protección Ciudadana (`ppc.xlsx`)
Base con una forma COMPLETAMENTE distinta a la del COMM: no hay un registro por
intervención, sino una **matriz ya agregada** — meses en las filas, tipos de
intervención en las columnas (hoja `Hoja1`, 8 meses × 9 tipos, 6.199
intervenciones de enero a agosto de 2026).

De ahí salen las diferencias de la vista, y NO son decisiones de diseño:
- **No hay mapa.** No hay domicilio, dispositivo ni coordenadas: no hay nada
  que georreferenciar. Tampoco hay turno, hora ni día de la semana.
- El filtro de fechas es un **rango de meses**, no un calendario: la unidad
  mínima del dato es el mes.
- No hay puntos críticos, ni percentiles, ni recurrencia territorial. Toda la
  metodología COMM (P75/P90/P95 por punto) necesita puntos, y acá no los hay.

⚠️ **`Intervencion general` NO es un tipo: es el total de la fila.** En los ocho
meses la suma de las otras nueve columnas da exactamente ese número. Contarla
como una categoría más duplicaría todos los totales. `ppcReader.js` no se fía
del nombre: `detectarColumnaTotal` verifica la identidad mes a mes, así que la
planilla puede renombrar la columna sin romper el cálculo.

Prevención se lleva el **63,2%** del acumulado (3.916 de 6.199). Es el único
tipo de despliegue planificado; los otros ocho son respuesta a un hecho. Por eso
la vista muestra esa proporción aparte: sin distinguirla, el volumen total de la
Patrulla se lee como si fuera todo respuesta a emergencias.

Y por eso la evolución por tipo son **mini gráficos con escala propia** y no un
apilado: entre Prevención (3.916) y Derrumbe (7) hay tres órdenes de magnitud, y
con eje compartido los tipos chicos quedan pegados al cero.

Endpoints: `GET /api/ppc` (filtros `tipo`, `mesDesde`, `mesHasta`) y
`GET /api/ppc/options`. Validación rápida:

```bash
curl -s localhost:4000/api/ppc | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.kpis.total, j.meta.totalCoincide, j.matriz.tipos.length)})"
```

Debe imprimir `6199 true 9`. `totalCoincide` contrasta la suma recalculada
contra la columna total del Excel; si diera `false`, el tablero muestra un
banner de aviso y usa SIEMPRE la suma recalculada.

## Defensa Civil (`defensa-civil.xlsx`)
⚠️ **La fuente es la hoja `Resumen Mensual`, NO la hoja `Base Operativa`.** El
Excel trae las dos y no coinciden. La Base Operativa es el volcado del libro de
guardia (3.833 filas) y está sucia: `FECHA` tiene 332 valores no numéricos
("2/9/0206", "16//02/2026") y 13 fechas fuera de 2026 (una de 1961, otra de
2027), y en 175 filas el mes no se corresponde con la fecha. Además le falta un
mes entero. El Resumen viene de otro sistema, es el dato que Defensa Civil da
por bueno y es el que lee el tablero.

La hoja trae DOS matrices con la misma forma que la de la PPC:

| Matriz | Qué mide | Filas | Total |
|---|---|---|---|
| Categorías de denuncia | qué pasó | 21 con datos | 3.532 netas + 648 de registro interno |
| Organismos / derivaciones | a quién se derivó | 26 con datos | 3.532 |

⚠️ **Las dos matrices NO se pueden cruzar.** La hoja da los totales de cada una
por separado, no la combinación: saber que hubo 590 emergencias eléctricas y
470 derivaciones a EDET no permite afirmar cuántas de esas 590 fueron a EDET.
Por eso el tablero deja elegir **una dimensión por vez** — elegir un organismo
suelta la categoría y viceversa.

⚠️ **Un mes está rotulado distinto en cada matriz**: la columna 7 figura como
*Julio* en la de categorías y como *Agosto* en la de derivaciones. Son la misma
columna —el "Subtotal operativo neto" de las dos coincide valor por valor, y
`dcReader.js` lo verifica en `alineacionVerificada` antes de alinearlas por
posición—, pero cuál es el mes real no se puede deducir del archivo. Hay que
corregirlo en la planilla. Cruzarlas por NOMBRE perdía los 327 registros de ese
mes (`totalDerivado` daba 3.205 en vez de 3.532).

**"Registro operativo interno" no es una denuncia**: son los asientos de
apertura y cierre de guardia (648 de 4.180 = 15,5%). La separación no es un
criterio propio: la hace la planilla con su fila "Subtotal operativo neto"
(Total general − Registro operativo interno), y el tablero usa ESE neto como
universo. Por eso el selector de áreas dice 3.532 y no 4.180.

Seis etiquetas quedaron fuera de las 16 categorías del clasificador (18
denuncias): `Infraestructura urbana` (9), `911` (5), `Bacheo`, `Buenos Aires`,
`Sin señalizar.` y `Please provide the incident description you would like me
to classify.` — un error de un clasificador automático que quedó guardado como
dato. Los conteos se respetan tal cual; el tablero los avisa en un banner y los
deja debajo del corte de 15 barras. Lo que hay que corregir es la etiqueta.

Endpoints: `GET /api/dc` (filtros `dimension` ∈ {categoria, organismo},
`valor`, `mesDesde`, `mesHasta`) y `GET /api/dc/options`. Validación rápida:

```bash
curl -s localhost:4000/api/dc | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.kpis.neto,j.kpis.interno,j.kpis.totalGeneral,j.meta.netoCuadra,j.meta.alineacionVerificada)})"
```

Debe imprimir `3532 648 4180 true true`.

## Pendiente para producción
Login de usuarios, seguridad por filas (RLS), refresco automático del Excel
(hoy la carga mensual es manual o por POST /api/upload).
