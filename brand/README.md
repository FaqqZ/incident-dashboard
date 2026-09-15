# Escudos de las áreas

Los PNG de acá son los **masters con fondo ya transparente**, a mayor
resolución que los que se publican. Sirven para volver a exportar el escudo en
otro tamaño sin depender de los archivos originales, que estaban sueltos en el
disco de quien los mandó.

| Archivo | Origen | Qué se le hizo |
|---|---|---|
| `logo-ppc-fuente.png` (355×434) | JPEG de WhatsApp | tenía la transparencia aplanada contra **negro** |
| `logo-dc-fuente.png` (577×578) | PNG de 2056×2048 | tenía fondo **blanco** opaco |

En los dos casos el fondo se sacó con [`../scripts/quitarFondo.js`](../scripts/quitarFondo.js),
que inunda desde los bordes en vez de marcar todo píxel claro u oscuro: así el
blanco del anillo de Defensa Civil —el que lleva el texto— no se borra, y el
escudo sigue legible sobre el navy del tablero.

Para regenerar lo que se publica:

```bash
sips -Z 240 brand/logo-dc-fuente.png --out client/public/logo-dc.png
sips -Z 240 brand/logo-ppc-fuente.png --out client/public/logo-ppc.png
```
