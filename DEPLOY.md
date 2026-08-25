# Despliegue

El tablero corre como **un solo servicio**: el mismo Express sirve la API y el
build del cliente en un único puerto. No hace falta un servidor web aparte.

## La "base de datos"

Son los dos Excel. No hay motor de base de datos, y es a propósito: la carga
mensual del COMM ES un Excel, y meter Postgres en el medio obligaría a
convertir de ida y de vuelta.

Lo que sí necesita es **disco persistente**:

| Directorio | Qué es | Se versiona |
|---|---|---|
| `server/seed/` | Excel que viajan dentro de la imagen. Nunca se escriben. | Sí |
| `server/data/` | Directorio de trabajo. Punto de montaje del disco. | No |

Al arrancar, si `DATA_DIR` está vacío se copia la semilla. Si ya tiene datos
**no se toca nada**: lo que cargaste por la web manda sobre la semilla y
sobrevive a cada redespliegue.

Ahí adentro viven también los respaldos de "Limpiar base de datos"
(`$DATA_DIR/backups/`).

⚠️ **Sin disco persistente, cada redespliegue vuelve a los datos de la semilla
y se pierde la carga mensual.** Es el motivo por el que Vercel no sirve para
esto: su disco es de solo lectura.

## Variables de entorno

| Variable | Obligatoria | Para qué |
|---|---|---|
| `UPLOAD_TOKEN` | **Sí** | Clave de gestión de datos. Sin ella, `/api/upload` y `/api/limpiar` quedan ABIERTOS. |
| `DATA_DIR` | Sí en contenedor | Dónde se monta el disco. El Dockerfile ya lo fija en `/data`. |
| `PORT` | No | Por defecto 4000. Los hosts suelen inyectarlo. |
| `EXCEL_PATH` / `SINIESTRALIDAD_PATH` | No | Para apuntar a otra ubicación. |

Generá el token con:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## Opción A — VPS propio con Docker

```bash
echo "UPLOAD_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")" > .env
```

```bash
docker compose up -d --build
```

Queda en `http://<tu-servidor>:4000`. Los datos viven en el volumen
`panel-datos`. Para respaldarlo:

```bash
docker run --rm -v panel-datos:/data -v "$PWD":/backup alpine tar czf /backup/panel-datos.tar.gz -C /data .
```

Poné un nginx o Caddy adelante para HTTPS.

## Opción B — Render

El repo ya trae `render.yaml`. Al crear el servicio detecta el Dockerfile y el
disco de 1 GB montado en `/data`. Cargá `UPLOAD_TOKEN` a mano en el panel.

⚠️ El plan free de Render **no admite discos persistentes**: hay que usar
starter o superior. Lo mismo pasa en Railway y Fly.

## Opción C — Cualquier host con Docker

Coolify, Dokploy, CapRover y similares toman el `Dockerfile` tal cual. Solo hay
que montar un volumen en `/data` y definir `UPLOAD_TOKEN`.

## Verificar que quedó bien

```bash
curl -s https://<tu-dominio>/api/health
```

Tiene que devolver `registrosReales: 29114`, `camaras: 494` y
`cargaHabilitada: true`. Ese último campo en `false` significa que el servidor
se cree serverless y la carga mensual está deshabilitada.

Después:

1. Entrá a `/datos` y cargá un Excel.
2. Redesplegá.
3. Volvé a `/api/health`: el número tiene que ser el que cargaste, no 29.114.
   Si volvió a 29.114, el disco no está montado.

## Pendiente

El login sigue siendo una clave compartida que viaja en un header y queda en el
`sessionStorage`. Sirve para evitar accidentes, no es control de accesos real.
Mientras tanto, conviene dejar el tablero detrás de una VPN o de un
`auth_basic` de nginx: son datos reales de Seguridad Ciudadana.
