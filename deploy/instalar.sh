#!/usr/bin/env bash
# Instala el panel en un servidor Linux como servicio de systemd.
# Se puede volver a correr para actualizar: no pisa ni los datos ni el token.
#
#   sudo bash deploy/instalar.sh
#
set -euo pipefail

APP_DIR=/opt/panel-incidentes
DATA_DIR=/var/lib/panel-incidentes
ENV_FILE=/etc/panel-incidentes.env
SERVICIO=panel-incidentes
USUARIO=panel
PUERTO="${PORT:-4000}"

if [[ $EUID -ne 0 ]]; then
  echo "Corré con sudo: sudo bash deploy/instalar.sh" >&2
  exit 1
fi

ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Node"
if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node. Instalalo primero (se necesita 20 o superior):" >&2
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs" >&2
  exit 1
fi
MAYOR=$(node -p "process.versions.node.split('.')[0]")
if (( MAYOR < 20 )); then
  echo "Node $(node -v) es muy viejo: se necesita 20 o superior." >&2
  exit 1
fi
echo "    $(node -v)"

echo "==> Usuario de servicio"
id -u "$USUARIO" >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$USUARIO"

echo "==> Construyendo el cliente"
# El build se hace en el origen, así el directorio de la app queda sin
# node_modules de desarrollo ni herramientas de compilación.
( cd "$ORIGEN/client" && npm ci && npm run build )

echo "==> Copiando la aplicación a $APP_DIR"
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude server/data \
  "$ORIGEN/server" "$ORIGEN/client/dist" "$ORIGEN/DEPLOY.md" "$APP_DIR/" 2>/dev/null || {
    # rsync puede no estar; alternativa con cp
    rm -rf "$APP_DIR/server" "$APP_DIR/client"
    mkdir -p "$APP_DIR/client"
    cp -r "$ORIGEN/server" "$APP_DIR/server"
    rm -rf "$APP_DIR/server/node_modules" "$APP_DIR/server/data"
    cp -r "$ORIGEN/client/dist" "$APP_DIR/client/dist"
    cp "$ORIGEN/DEPLOY.md" "$APP_DIR/" 2>/dev/null || true
  }
# rsync copia server/ dentro de APP_DIR pero client/dist queda suelto: acomodar
if [[ -d "$APP_DIR/dist" ]]; then
  mkdir -p "$APP_DIR/client"
  rm -rf "$APP_DIR/client/dist"
  mv "$APP_DIR/dist" "$APP_DIR/client/dist"
fi

echo "==> Dependencias del backend (solo producción)"
( cd "$APP_DIR/server" && npm ci --omit=dev )

echo "==> Directorio de datos"
# Persiste fuera de $APP_DIR: reinstalar la app no toca la carga mensual.
mkdir -p "$DATA_DIR"
chown -R "$USUARIO:$USUARIO" "$DATA_DIR"

echo "==> Variables de entorno"
if [[ -f "$ENV_FILE" ]]; then
  echo "    $ENV_FILE ya existe, se conserva el token actual"
else
  TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
  cat > "$ENV_FILE" <<EOF
PORT=$PUERTO
DATA_DIR=$DATA_DIR
UPLOAD_TOKEN=$TOKEN
EOF
  chmod 600 "$ENV_FILE"
  echo
  echo "    ┌─────────────────────────────────────────────────────────────┐"
  echo "    │ CLAVE DE GESTIÓN DE DATOS (guardala, no se vuelve a mostrar) │"
  echo "    └─────────────────────────────────────────────────────────────┘"
  echo "      $TOKEN"
  echo
fi
chown root:"$USUARIO" "$ENV_FILE"
chmod 640 "$ENV_FILE"

echo "==> Servicio systemd"
cp "$ORIGEN/deploy/panel-incidentes.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable "$SERVICIO"
systemctl restart "$SERVICIO"

sleep 3
echo "==> Estado"
systemctl --no-pager --lines=0 status "$SERVICIO" || true

echo
if curl -fsS "http://127.0.0.1:$PUERTO/api/health" >/dev/null 2>&1; then
  REG=$(curl -fsS "http://127.0.0.1:$PUERTO/api/health" | node -pe "JSON.parse(require('fs').readFileSync(0)).totalRegistros")
  echo "OK: el panel responde en el puerto $PUERTO con $REG registros."
else
  echo "El panel NO responde todavía. Mirá el log:  journalctl -u $SERVICIO -n 50 --no-pager" >&2
  exit 1
fi

echo
echo "Falta abrir el puerto $PUERTO en el firewall:"
echo "  ufw:      sudo ufw allow $PUERTO/tcp"
echo "  firewalld: sudo firewall-cmd --permanent --add-port=$PUERTO/tcp && sudo firewall-cmd --reload"
