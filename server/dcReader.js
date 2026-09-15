// dcReader.js — lectura y medidas de Defensa Civil.
//
// FUENTE: la hoja "Resumen Mensual", NO la hoja "Base Operativa".
//
// El Excel trae las dos. La Base Operativa es el volcado del libro de guardia
// (3.833 filas) y NO coincide con el Resumen: le falta un mes entero, la
// columna FECHA tiene 332 valores no numéricos y 175 filas donde el mes no se
// corresponde con la fecha. El Resumen viene de otro sistema y es el dato que
// Defensa Civil da por bueno, así que el tablero lee de ahí.
//
// La hoja tiene DOS matrices con la misma forma que la de la PPC —meses en las
// columnas, etiquetas en las filas— y por eso esta vista tampoco lleva mapa:
// el dato ya viene sumado por mes, sin domicilio ni coordenadas.
//
//   1. CATEGORÍAS DE DENUNCIA   (qué pasó)      → 22 filas
//   2. ORGANISMOS / DERIVACIONES (a quién fue)  → 28 filas
//
// ⚠️ Las dos matrices NO se pueden cruzar entre sí: la hoja da los totales de
// cada una por separado, no la combinación. Saber que hubo 590 emergencias
// eléctricas y 470 derivaciones a EDET no permite afirmar cuántas de esas 590
// fueron a EDET. Por eso el tablero deja elegir UNA dimensión por vez.
//
// ⚠️ "Registro operativo interno" no es una denuncia: son los asientos de
// apertura y cierre de guardia. La hoja ya lo separa con su fila "Subtotal
// operativo neto" (Total general − Registro operativo interno), y el tablero
// usa ESE neto como universo por defecto. No es un criterio propio: es el que
// define la propia planilla.

const XLSX = require("xlsx");

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const txt = (v) => (v == null ? "" : String(v).trim());
const num = (v) => (Number.isFinite(v) ? v : 0);
const mesNro = (s) => MESES.indexOf(norm(s)) + 1;

const REGISTRO_INTERNO = "Registro operativo interno";
const esRegistroInterno = (e) => norm(e) === norm(REGISTRO_INTERNO);

// Filas que cierran una matriz en vez de ser un dato más.
const esFilaTotal = (e) => /^(subtotal|total general)/i.test(txt(e));

// Las 16 categorías del clasificador de Defensa Civil. Sirven para avisar
// cuáles etiquetas se escaparon de la taxonomía (quedaron algunas sueltas, y
// hasta un mensaje de error de un clasificador automático), sin descartarlas:
// los conteos son válidos aunque la etiqueta esté mal escrita.
const TAXONOMIA = [
  "Incendios", "Emergencia eléctrica", "Emergencia médica y personas en riesgo",
  "Accidentes de tránsito", "Arbolado urbano", "Estructuras e infraestructura en riesgo",
  "Pozos hundimientos y veredas", "Alumbrado público", "Agua y cloacas",
  "Inundaciones y anegamientos", "Señalización y tránsito", "Residuos y limpieza",
  "Fauna y plagas", "Materiales y sustancias peligrosas",
  "Asistencia social y gestión administrativa", REGISTRO_INTERNO,
].map(norm);

// Una fila es encabezado de matriz si su primera celda tiene texto y al menos
// tres de las siguientes son nombres de mes. Detectarlo así —y no por número
// de fila— permite que la planilla crezca o se reordene sin romper nada.
function esEncabezado(fila) {
  if (!fila || !txt(fila[0])) return false;
  const meses = fila.slice(1).filter((c) => mesNro(c) > 0);
  return meses.length >= 3;
}

function leerMatriz(grid, iCab) {
  const cab = grid[iCab];
  const columnas = [];
  for (let c = 1; c < cab.length; c++) {
    const nro = mesNro(cab[c]);
    if (nro) columnas.push({ idx: c, mes: MESES[nro - 1], mesNro: nro });
  }
  // Orden cronológico: la planilla los exporta alfabéticamente (Abril, Julio,
  // Enero…), que en un gráfico de evolución no significaría nada.
  columnas.sort((a, b) => a.mesNro - b.mesNro);

  const filas = [];
  const especiales = {};
  let i = iCab + 1;
  for (; i < grid.length; i++) {
    const f = grid[i];
    const etiqueta = txt(f?.[0]);
    if (!etiqueta) {
      // Un renglón en blanco corta la matriz solo si ya venía leyendo datos.
      if (filas.length) break;
      continue;
    }
    if (esFilaTotal(etiqueta)) {
      especiales[norm(etiqueta)] = columnas.reduce((acc, col) => {
        acc[col.mes] = num(f[col.idx]);
        return acc;
      }, {});
      continue;
    }
    if (esEncabezado(f)) break; // arrancó la matriz siguiente
    const valores = {};
    let total = 0;
    columnas.forEach((col) => {
      const v = num(f[col.idx]);
      valores[col.mes] = v;
      total += v;
    });
    filas.push({ etiqueta, valores, total, declarado: num(f[f.length - 1]) });
  }

  return { titulo: txt(cab[0]), meses: columnas.map((c) => c.mes), filas, especiales, finEn: i };
}

function loadDC(filePath, opts = {}) {
  const wb = XLSX.readFile(filePath);
  const hoja =
    opts.hoja ||
    wb.SheetNames.find((n) => norm(n).includes("resumen")) ||
    wb.SheetNames[0];
  if (!wb.Sheets[hoja]) {
    throw new Error(`No se encontró la hoja de resumen. Hojas: ${wb.SheetNames.join(", ")}`);
  }

  const grid = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: null, raw: true });
  const matrices = [];
  for (let i = 0; i < grid.length; i++) {
    if (!esEncabezado(grid[i])) continue;
    const m = leerMatriz(grid, i);
    if (m.filas.length) matrices.push(m);
    i = m.finEn - 1;
  }
  if (matrices.length < 2) {
    throw new Error(
      `La hoja "${hoja}" no trae las dos matrices esperadas (denuncias y derivaciones); ` +
        `se encontraron ${matrices.length}`
    );
  }

  const [mCat, mOrg] = matrices;

  // Las dos matrices rotulan distinto una misma columna: la de categorías dice
  // "Julio" donde la de derivaciones dice "Agosto". Se alinean POR POSICIÓN, no
  // por nombre, porque hay prueba de que son la misma columna: la fila
  // "Subtotal operativo neto" es idéntica en las dos, valor por valor. Cruzarlas
  // por nombre perdía los 327 registros de ese mes.
  //
  // Cuál de los dos rótulos es el correcto NO se puede deducir de la planilla,
  // así que se informa el conflicto y manda el de la primera matriz.
  const mesesEnConflicto = [];
  if (mOrg.meses.length === mCat.meses.length) {
    const renombre = {};
    mCat.meses.forEach((m, i) => {
      if (mOrg.meses[i] !== m) {
        mesesEnConflicto.push({ posicion: i + 1, categorias: m, derivaciones: mOrg.meses[i] });
        renombre[mOrg.meses[i]] = m;
      }
    });
    if (Object.keys(renombre).length) {
      // Hay que renombrar TAMBIÉN las filas de subtotal: son las que después
      // se usan para verificar que la alineación fue correcta.
      const renombrar = (valores) => {
        Object.entries(renombre).forEach(([viejo, nuevo]) => {
          valores[nuevo] = valores[viejo] || 0;
          delete valores[viejo];
        });
      };
      mOrg.filas.forEach((f) => renombrar(f.valores));
      Object.values(mOrg.especiales).forEach(renombrar);
      mOrg.meses = [...mCat.meses];
    }
  } else {
    throw new Error(
      `Las dos matrices no tienen la misma cantidad de meses ` +
        `(${mCat.meses.length} y ${mOrg.meses.length}): no se pueden alinear.`
    );
  }

  // Filas en cero (organismos declarados que nunca recibieron nada): se dejan
  // afuera de los gráficos para no dibujar barras vacías, pero se cuentan.
  const vacios = {
    categorias: mCat.filas.filter((f) => f.total === 0).map((f) => f.etiqueta),
    organismos: mOrg.filas.filter((f) => f.total === 0).map((f) => f.etiqueta),
  };

  const categorias = mCat.filas.filter((f) => f.total > 0 && !esRegistroInterno(f.etiqueta));
  const interno = mCat.filas.find((f) => esRegistroInterno(f.etiqueta)) || null;
  const organismos = mOrg.filas.filter((f) => f.total > 0 && !esRegistroInterno(f.etiqueta));

  const meses = mCat.meses;
  const sumaPorMes = (filas) =>
    meses.reduce((acc, m) => ((acc[m] = filas.reduce((s, f) => s + (f.valores[m] || 0), 0)), acc), {});

  const netoPorMes = sumaPorMes(categorias);
  const internoPorMes = interno ? { ...interno.valores } : {};
  const derivadoPorMes = sumaPorMes(organismos);

  // Control contra las filas que la propia planilla trae calculadas.
  const declaradoNeto = mCat.especiales[norm("Subtotal operativo neto")] || null;
  const declaradoTotal = mCat.especiales[norm("Total general")] || null;
  const cuadra = (calc, decl) =>
    !decl || meses.every((m) => (calc[m] || 0) === (decl[m] || 0));

  // Esto es lo que habilita a alinear las columnas por posición: las dos
  // matrices traen su propio "Subtotal operativo neto" y tienen que ser el
  // mismo número en cada mes. Si dejara de cumplirse, la alineación sería una
  // suposición y el dato saldría mal sin avisar.
  const netoOrg = mOrg.especiales[norm("Subtotal operativo neto")] || null;
  const alineacionVerificada = Boolean(
    declaradoNeto && netoOrg && meses.every((m) => (declaradoNeto[m] || 0) === (netoOrg[m] || 0))
  );

  const fueraDeTaxonomia = categorias
    .filter((f) => !TAXONOMIA.includes(norm(f.etiqueta)))
    .map((f) => ({ etiqueta: f.etiqueta, total: f.total }))
    .sort((a, b) => b.total - a.total);

  return {
    meses,
    categorias: categorias.map((f) => ({ etiqueta: f.etiqueta, valores: f.valores, total: f.total })),
    organismos: organismos.map((f) => ({ etiqueta: f.etiqueta, valores: f.valores, total: f.total })),
    interno: { porMes: internoPorMes, total: Object.values(internoPorMes).reduce((a, b) => a + b, 0) },
    porMes: { neto: netoPorMes, derivado: derivadoPorMes },
    meta: {
      hoja,
      archivo: filePath,
      periodo: meses.length ? `${meses[0]} a ${meses[meses.length - 1]}` : null,
      mesesObservados: meses.length,
      categoriasDetectadas: categorias.length,
      organismosDetectados: organismos.length,
      totalNeto: Object.values(netoPorMes).reduce((a, b) => a + b, 0),
      totalInterno: Object.values(internoPorMes).reduce((a, b) => a + b, 0),
      totalDerivado: Object.values(derivadoPorMes).reduce((a, b) => a + b, 0),
      // Diagnósticos que la vista muestra como avisos.
      netoCuadra: cuadra(netoPorMes, declaradoNeto),
      totalCuadra: cuadra(
        meses.reduce((acc, m) => ((acc[m] = (netoPorMes[m] || 0) + (internoPorMes[m] || 0)), acc), {}),
        declaradoTotal
      ),
      mesesEnConflicto,
      alineacionVerificada,
      fueraDeTaxonomia,
      vacios,
    },
  };
}

// --- Medidas -------------------------------------------------------------

const redondear = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

function recortar(meses, { mesDesde, mesHasta }) {
  const desde = mesDesde ? mesNro(mesDesde) : 0;
  const hasta = mesHasta ? mesNro(mesHasta) : 0;
  return meses.filter((m) => {
    const n = mesNro(m);
    return (!desde || n >= desde) && (!hasta || n <= hasta);
  });
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function serie(filas, meses) {
  return filas
    .map((f) => ({
      name: f.etiqueta,
      value: meses.reduce((acc, m) => acc + (f.valores[m] || 0), 0),
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
}

function resumenDC(datos, filtros = {}) {
  const { dimension = null, valor = null, mesDesde = null, mesHasta = null } = filtros;
  const meses = recortar(datos.meses, { mesDesde, mesHasta });

  // Solo se filtra por UNA dimensión: la planilla no permite cruzar categoría
  // con organismo (ver el encabezado del archivo).
  const enCategoria = dimension === "categoria" && valor ? valor : null;
  const enOrganismo = dimension === "organismo" && valor ? valor : null;

  const catsFiltradas = enCategoria
    ? datos.categorias.filter((c) => c.etiqueta === enCategoria)
    : datos.categorias;
  const orgsFiltrados = enOrganismo
    ? datos.organismos.filter((o) => o.etiqueta === enOrganismo)
    : datos.organismos;

  // La evolución sigue la dimensión elegida; sin selección, el neto operativo.
  const filasSerie = enOrganismo ? orgsFiltrados : catsFiltradas;
  const porMes = meses.map((m) => ({
    name: m,
    mesnro: mesNro(m),
    value: filasSerie.reduce((acc, f) => acc + (f.valores[m] || 0), 0),
  }));

  // Las barras NO se recortan con la selección: si quedara una sola no habría
  // forma de cambiar de categoría desde el propio gráfico. Se atenúan en el
  // cliente, igual que en la PPC.
  const porCategoria = serie(datos.categorias, meses);
  const porOrganismo = serie(datos.organismos, meses);

  const neto = meses.reduce((acc, m) => acc + (datos.porMes.neto[m] || 0), 0);
  const interno = meses.reduce((acc, m) => acc + (datos.interno.porMes[m] || 0), 0);
  const total = porMes.reduce((acc, m) => acc + m.value, 0);

  const mesPico = porMes.reduce((mejor, m) => (!mejor || m.value > mejor.value ? m : mejor), null);

  let variacion = null;
  if (porMes.length >= 2) {
    const ult = porMes[porMes.length - 1];
    const prev = porMes[porMes.length - 2];
    variacion = {
      mes: ult.name,
      contra: prev.name,
      valor: ult.value,
      anterior: prev.value,
      pct: prev.value ? redondear(((ult.value - prev.value) / prev.value) * 100, 1) : null,
    };
  }

  const elegido = (lista) => (valor ? lista.find((d) => d.name === valor) || null : lista[0] || null);

  return {
    filtros: { dimension, valor, mesDesde, mesHasta },
    kpis: {
      total,
      neto,
      interno,
      totalGeneral: neto + interno,
      mesesObservados: meses.length,
      promedioMensual: porMes.length ? redondear(total / porMes.length) : 0,
      mesPico: mesPico ? { name: mesPico.name, value: mesPico.value } : null,
      categoriaTop: enOrganismo ? porCategoria[0] || null : elegido(porCategoria),
      organismoTop: enCategoria ? porOrganismo[0] || null : elegido(porOrganismo),
      variacion,
      pctInterno: neto + interno ? redondear((interno / (neto + interno)) * 100, 1) : 0,
    },
    porMes,
    porCategoria,
    porOrganismo,
    serieCategorias: porCategoria.map((c) => {
      const fila = datos.categorias.find((f) => f.etiqueta === c.name);
      return {
        tipo: c.name,
        total: c.value,
        puntos: meses.map((m) => ({ name: m, mesnro: mesNro(m), value: fila.valores[m] || 0 })),
      };
    }),
    matriz: {
      tipos: porCategoria.map((c) => c.name),
      filas: meses.map((m) => ({
        mes: m,
        mesnro: mesNro(m),
        valores: datos.categorias.reduce((acc, c) => ((acc[c.etiqueta] = c.valores[m] || 0), acc), {}),
        total: datos.porMes.neto[m] || 0,
      })),
      totalesPorTipo: porCategoria.reduce((acc, c) => ((acc[c.name] = c.value), acc), {}),
      total: neto,
    },
    meta: { ...datos.meta, periodoEnVista: meses.length ? `${cap(meses[0])} a ${cap(meses[meses.length - 1])}` : null },
  };
}

function opcionesDC(datos) {
  return {
    categorias: datos.categorias.map((c) => c.etiqueta).sort((a, b) => a.localeCompare(b, "es")),
    organismos: datos.organismos.map((o) => o.etiqueta).sort((a, b) => a.localeCompare(b, "es")),
    meses: datos.meses,
  };
}

module.exports = { loadDC, resumenDC, opcionesDC };
