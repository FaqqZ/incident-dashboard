// ppcReader.js — lectura y medidas de la Patrulla de Protección Ciudadana.
//
// La base de la PPC NO tiene la forma de la del COMM. No hay un registro por
// intervención: lo que entrega el área es una MATRIZ ya agregada, meses en las
// filas y tipos de intervención en las columnas.
//
//        | Intervencion general | Derrumbe | Disturbios | ...
//  Enero |                  628 |        2 |         92 | ...
//
// Consecuencias directas de esa forma, y por qué esta vista no es la del COMM:
//   · No hay domicilio ni dispositivo, así que NO HAY MAPA posible. Nada que
//     georreferenciar: el dato ya viene sumado por mes.
//   · Tampoco hay turno, hora ni día de la semana.
//   · La unidad mínima es el mes, así que el filtro de fechas es un rango de
//     meses y no un calendario.
//
// ⚠️ "Intervencion general" NO es un tipo: es el TOTAL de la fila. En los ocho
// meses de 2026 la suma de las otras nueve columnas da exactamente ese número
// (628, 472, 759, 1008, 1020, 796, 747, 769). Contarla como una categoría más
// duplicaría todos los totales. Acá no se da por sentado por el nombre: se
// detecta verificando la identidad mes a mes (ver detectarColumnaTotal).

const XLSX = require("xlsx");

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Comparaciones sin acentos ni mayúsculas: el Excel escribe "Prevencion" sin
// tilde y "Violencia de genero" también, pero eso puede cambiar en la próxima
// planilla sin que se rompa nada.
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const mesNro = (s) => MESES.indexOf(norm(s)) + 1; // 0 si no es un mes

// La columna total es la que, en TODOS los meses, vale lo mismo que la suma de
// las demás. Se verifica en vez de buscar el nombre, así la planilla puede
// renombrarla y el cálculo sigue siendo correcto.
function detectarColumnaTotal(tipos, filas) {
  if (tipos.length < 3 || filas.length === 0) return null;
  for (const candidato of tipos) {
    const resto = tipos.filter((t) => t !== candidato);
    const coincideSiempre = filas.every((f) => {
      const suma = resto.reduce((acc, t) => acc + (f.valores[t] || 0), 0);
      return suma === (f.valores[candidato] || 0);
    });
    // Un mes entero en cero cumpliría la igualdad sin significar nada.
    const hayVolumen = filas.some((f) => (f.valores[candidato] || 0) > 0);
    if (coincideSiempre && hayVolumen) return candidato;
  }
  return null;
}

function loadPPC(filePath, opts = {}) {
  const wb = XLSX.readFile(filePath);
  const hoja = opts.hoja || wb.SheetNames[0];
  if (!wb.Sheets[hoja]) {
    throw new Error(`No se encontró la hoja "${hoja}". Hojas: ${wb.SheetNames.join(", ")}`);
  }

  const grid = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: null, raw: true });
  if (!grid.length) throw new Error("La hoja de la PPC está vacía");

  // Fila 0: la celda A trae el año y el resto los nombres de los tipos.
  const encabezado = grid[0];
  const anio = Number(String(encabezado[0] ?? "").match(/\d{4}/)?.[0]) || null;

  const columnas = [];
  for (let c = 1; c < encabezado.length; c++) {
    const nombre = String(encabezado[c] ?? "").trim();
    if (nombre) columnas.push({ idx: c, nombre });
  }
  if (!columnas.length) {
    throw new Error("La primera fila no trae nombres de tipos de intervención");
  }

  // Solo las filas cuya primera celda es un mes. Así quedan afuera tanto la
  // fila "Total mensual" (subtítulo) como la de "Total acumulado 2026", que se
  // recalculan acá en lugar de arrastrarse del Excel.
  const filas = [];
  let totalDeclarado = null;
  for (let r = 1; r < grid.length; r++) {
    const etiqueta = grid[r]?.[0];
    if (etiqueta == null || etiqueta === "") continue;
    const nro = mesNro(etiqueta);
    if (!nro) {
      if (norm(etiqueta).startsWith("total")) {
        totalDeclarado = columnas.reduce((acc, col) => {
          const v = Number(grid[r][col.idx]);
          acc[col.nombre] = Number.isFinite(v) ? v : 0;
          return acc;
        }, {});
      }
      continue;
    }
    const valores = {};
    columnas.forEach((col) => {
      const v = Number(grid[r][col.idx]);
      valores[col.nombre] = Number.isFinite(v) ? v : 0;
    });
    filas.push({ mes: MESES[nro - 1], mesNro: nro, valores });
  }

  if (!filas.length) throw new Error("No se encontró ninguna fila de mes en la hoja de la PPC");
  filas.sort((a, b) => a.mesNro - b.mesNro);

  const nombres = columnas.map((c) => c.nombre);
  const columnaTotal = detectarColumnaTotal(nombres, filas);
  const tipos = nombres.filter((t) => t !== columnaTotal);

  const registros = filas.map((f) => ({
    mes: f.mes,
    mesNro: f.mesNro,
    valores: tipos.reduce((acc, t) => ((acc[t] = f.valores[t] || 0), acc), {}),
    // El total se RECALCULA siempre. Si el Excel trae su propia columna, se
    // guarda aparte para poder contrastarla (ver meta.totalCoincide).
    total: tipos.reduce((acc, t) => acc + (f.valores[t] || 0), 0),
    totalDeclarado: columnaTotal ? f.valores[columnaTotal] || 0 : null,
  }));

  const totalCoincide = registros.every(
    (r) => r.totalDeclarado === null || r.totalDeclarado === r.total
  );

  return {
    meses: registros,
    tipos,
    meta: {
      hoja,
      anio,
      archivo: filePath,
      columnaTotal,
      tiposDetectados: tipos.length,
      mesesObservados: registros.length,
      periodo: registros.length
        ? `${registros[0].mes} a ${registros[registros.length - 1].mes}${anio ? ` de ${anio}` : ""}`
        : null,
      total: registros.reduce((acc, r) => acc + r.total, 0),
      // Control contra la fila "Total acumulado" del Excel, si existe.
      totalAcumuladoDeclarado: columnaTotal && totalDeclarado ? totalDeclarado[columnaTotal] : null,
      totalCoincide,
    },
  };
}

// --- Medidas -------------------------------------------------------------

// Días reales del mes: el promedio diario de una patrulla no es el mismo en
// febrero que en marzo, y con ocho meses la diferencia se nota.
function diasDelMes(anio, nro) {
  return new Date(anio || 2026, nro, 0).getDate();
}

function recortarMeses(meses, { mesDesde, mesHasta }) {
  const desde = mesDesde ? mesNro(mesDesde) : 0;
  const hasta = mesHasta ? mesNro(mesHasta) : 0;
  return meses.filter(
    (m) => (!desde || m.mesNro >= desde) && (!hasta || m.mesNro <= hasta)
  );
}

const redondear = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

// "Prevención" es el único tipo que describe presencia planificada; los otros
// ocho son respuesta a un hecho ya ocurrido. Separarlos importa porque
// Prevención sola se lleva el 63% del acumulado: sin distinguirla, el volumen
// total de la Patrulla se lee como si fuera todo respuesta a emergencias.
function esPreventivo(tipo) {
  return norm(tipo).startsWith("prevencion");
}

function resumenPPC(datos, filtros = {}) {
  const { tipo = null, mesDesde = null, mesHasta = null } = filtros;
  const anio = datos.meta.anio;
  const enRango = recortarMeses(datos.meses, { mesDesde, mesHasta });
  const tiposVisibles = tipo && datos.tipos.includes(tipo) ? [tipo] : datos.tipos;

  const valorDe = (m) => tiposVisibles.reduce((acc, t) => acc + (m.valores[t] || 0), 0);

  const porMes = enRango.map((m) => ({
    name: m.mes,
    mesnro: m.mesNro,
    value: valorDe(m),
    dias: diasDelMes(anio, m.mesNro),
  }));

  // porTipo IGNORA el filtro de tipo a propósito: si se recortara, el gráfico
  // quedaría con una sola barra y no se podría cambiar de tipo desde ahí. Las
  // barras no elegidas se atenúan en el cliente.
  const porTipo = datos.tipos
    .map((t) => ({ name: t, value: enRango.reduce((acc, m) => acc + (m.valores[t] || 0), 0) }))
    .sort((a, b) => b.value - a.value);

  const total = porMes.reduce((acc, m) => acc + m.value, 0);
  const dias = porMes.reduce((acc, m) => acc + m.dias, 0);

  const mesPico = porMes.reduce((mejor, m) => (!mejor || m.value > mejor.value ? m : mejor), null);
  const tipoTop = tipo
    ? porTipo.find((t) => t.name === tipo) || null
    : porTipo[0] || null;

  // Variación del último mes contra el anterior. Con un solo mes en vista no
  // hay contra qué comparar y se devuelve null en lugar de un 0 engañoso.
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

  const preventivo = porTipo.filter((t) => esPreventivo(t.name)).reduce((a, t) => a + t.value, 0);
  const totalRango = porTipo.reduce((acc, t) => acc + t.value, 0);

  // Serie por tipo para los mini gráficos: cada tipo con su propia escala,
  // porque Prevención y Derrumbe difieren en tres órdenes de magnitud y en un
  // gráfico apilado los tipos chicos desaparecen.
  const serieTipos = porTipo.map((t) => ({
    tipo: t.name,
    total: t.value,
    puntos: enRango.map((m) => ({ name: m.mes, mesnro: m.mesNro, value: m.valores[t.name] || 0 })),
  }));

  return {
    filtros: { tipo, mesDesde, mesHasta },
    kpis: {
      total,
      mesesObservados: porMes.length,
      dias,
      promedioMensual: porMes.length ? redondear(total / porMes.length) : 0,
      promedioDiario: dias ? redondear(total / dias) : 0,
      mesPico: mesPico ? { name: mesPico.name, value: mesPico.value } : null,
      tipoTop: tipoTop
        ? {
            name: tipoTop.name,
            value: tipoTop.value,
            pct: totalRango ? redondear((tipoTop.value / totalRango) * 100, 1) : 0,
          }
        : null,
      variacion,
      preventivo: {
        valor: preventivo,
        pct: totalRango ? redondear((preventivo / totalRango) * 100, 1) : 0,
        respuesta: totalRango - preventivo,
      },
    },
    porTipo,
    porMes: porMes.map(({ name, mesnro, value }) => ({ name, mesnro, value })),
    serieTipos,
    // Tabla de referencia: siempre con todos los tipos, aunque haya uno elegido.
    matriz: {
      tipos: datos.tipos,
      filas: enRango.map((m) => ({
        mes: m.mes,
        mesnro: m.mesNro,
        valores: m.valores,
        total: m.total,
      })),
      totalesPorTipo: datos.tipos.reduce((acc, t) => {
        acc[t] = enRango.reduce((s, m) => s + (m.valores[t] || 0), 0);
        return acc;
      }, {}),
      total: enRango.reduce((acc, m) => acc + m.total, 0),
    },
    meta: datos.meta,
  };
}

function opcionesPPC(datos) {
  return {
    tipos: [...datos.tipos].sort((a, b) => a.localeCompare(b, "es")),
    meses: datos.meses.map((m) => m.mes),
  };
}

module.exports = { loadPPC, resumenPPC, opcionesPPC, MESES };
