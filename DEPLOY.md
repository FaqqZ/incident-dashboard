# Despliegue en un servidor propio

El tablero corre como **un solo proceso Node** que sirve la API y el frontend en
un único puerto. No necesita nginx, ni Docker, ni base de datos externa.

---

## La "base de datos"

Son los dos Excel. No hay motor de base de datos, y es a propósito: la carga
mensual del COMM **es** un Excel, y meter Postgres en el medio obligaría a
convertir de ida y de vuelta en cada actualización.

| Directorio | Qué es |
|---|---|
| `server/seed/` | Excel que vienen con el código. **Nunca se escriben.** |
| `$DATA_DIR` | Dónde vive la base en el servidor. Por defecto `/var/lib/panel-incidentes`. |

Al arrancar, si `DATA_DIR` está vacío se copia la semilla. Si ya tiene datos
**no se toca nada**: lo que cargues por la web manda, y sobrevive a las
actualizaciones del código.

Ahí adentro van también los respaldos de "Limpiar base de datos", en
`$DATA_DIR/backups/`.

> `DATA_DIR` queda **fuera** de la carpeta de la aplicación justamente para que
> reinstalar o actualizar no pise la carga mensual.

---

## Instalación

En el servidor, con el código ya copiado (git clone o scp):

```bash
sudo bash deploy/instalar.sh
```

El script hace todo: verifica Node, crea el usuario de servicio `panel`,
construye el cliente, copia la app a `/opt/panel-incidentes`, instala las
dependencias de producción, crea `/var/lib/panel-incidentes`, **genera el token
de gestión y lo muestra una sola vez**, instala el servicio de systemd, lo
arranca y comprueba que responda.

Se puede volver a correr para actualizar: no pisa ni los datos ni el token.

Para usar otro puerto:

```bash
sudo PORT=8080 bash deploy/instalar.sh
```

---

## Abrir el puerto

El script no toca el firewall. Según el servidor:

```bash
sudo ufw allow 4000/tcp
```

```bash
sudo firewall-cmd --permanent --add-port=4000/tcp && sudo firewall-cmd --reload
```

Si es una VM en la nube, además hay que habilitarlo en el grupo de seguridad
del proveedor.

Queda accesible en `http://IP-DEL-SERVIDOR:4000`.

---

## Operación diaria

```bash
sudo systemctl status panel-incidentes
```

```bash
sudo journalctl -u panel-incidentes -f
```

```bash
sudo systemctl restart panel-incidentes
```

La clave de gestión está en `/etc/panel-incidentes.env`, con permisos 640.
Para cambiarla, editá ese archivo y reiniciá el servicio.

### Respaldar la base

```bash
sudo tar czf panel-datos-$(date +%F).tar.gz -C /var/lib/panel-incidentes .
```

---

## Verificar que quedó bien

```bash
curl -s http://localhost:4000/api/health
```

Tiene que devolver `registrosReales: 29114`, `camaras: 494` y
`cargaHabilitada: true`.

La prueba que importa es la persistencia:

1. Entrá a `/datos` y cargá un Excel (o limpiá la base).
2. `sudo systemctl restart panel-incidentes`
3. Volvé a `/api/health`.

Si el número es el que cargaste, está bien. Si volvió a 29.114, `DATA_DIR` no
está apuntando donde debe.

---

## Alternativa con Docker

Si el servidor ya tiene Docker, el repo trae `Dockerfile` y
`docker-compose.yml`:

```bash
echo "UPLOAD_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")" > .env
```

```bash
docker compose up -d --build
```

Mismo puerto 4000, y los datos en el volumen `panel-datos`.

---

## Seguridad — leer antes de exponerlo

Son datos reales de Seguridad Ciudadana en un puerto abierto. Tres cosas:

**1. El tablero no tiene login.** Cualquiera que llegue a la IP y el puerto ve
los 29.114 incidentes con direcciones e IDs de cámaras. La clave solo protege
`/datos`, no la vista principal.

**2. Va por HTTP, sin cifrar.** La clave de gestión viaja en texto plano en un
header. En una red interna puede pasar; expuesto a internet, no.

**3. La clave es compartida**, viaja en un header y queda en el `sessionStorage`
del navegador. Sirve para evitar accidentes, no es control de accesos real.

Lo mínimo razonable si sale a internet: ponerle un nginx adelante con HTTPS
(Let's Encrypt) y un `auth_basic`, o dejarlo solo accesible por VPN / IP
interna. El login de usuarios con roles sigue pendiente.
