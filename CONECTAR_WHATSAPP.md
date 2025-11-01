# 📱 Conectar WhatsApp a Nexora

Hay **dos métodos** para conectar WhatsApp:

## 🔢 Método 1: Código de Vinculación (RECOMENDADO) ⭐

Este método es **más estable** y **más fácil** porque no necesitas escanear un QR que cambia rápidamente.

### Paso 1: Solicitar el código

```bash
./scripts/request-pairing-code.sh +TU_NUMERO_COMPLETO
```

**Ejemplo:**
```bash
# México
./scripts/request-pairing-code.sh +5215512345678

# USA
./scripts/request-pairing-code.sh +14155551234

# España
./scripts/request-pairing-code.sh +34612345678
```

> ⚠️ **Importante:** Usa TU número de WhatsApp (el que está registrado en tu cuenta)

### Paso 2: Vincular en WhatsApp

1. **Abre WhatsApp** en tu teléfono móvil
2. Ve a **Configuración** (⚙️) > **Dispositivos Vinculados**
3. Toca **"Vincular un dispositivo"**
4. Selecciona **"Vincular con número de teléfono"**
5. **Ingresa el código** de 8 dígitos que te mostró el script

¡Listo! Tu WhatsApp estará conectado.

---

## 📷 Método 2: Código QR (Alternativo)

Si prefieres usar QR code:

### Ver el QR en el navegador

```
http://localhost:3011/wa/qr
```

### Ver el QR en la terminal

```bash
docker logs nexora-whatsapp -f
```

> ⚠️ **Nota:** Los QR codes expiran rápido (cada 2 minutos). Si no alcanzas a escanearlo, se generará uno nuevo automáticamente.

### Escanear el QR

1. **Abre WhatsApp** en tu teléfono móvil
2. Ve a **Configuración** > **Dispositivos Vinculados**
3. Toca **"Vincular un dispositivo"**
4. **Escanea el código QR**

---

## 🔍 Verificar Conexión

### Comprobar estado

```bash
curl http://localhost:3011/wa/qr
```

Deberías ver algo como:
```json
{
  "status": "open",  // ✅ Conectado
  "qr": null
}
```

Estados posibles:
- `"disconnected"` - No conectado
- `"connecting"` - Conectando...
- `"open"` - ✅ Conectado exitosamente

### Ver logs en tiempo real

```bash
docker logs nexora-whatsapp -f
```

Busca mensajes como:
```
✅ session.connection.open
```

---

## ❓ Troubleshooting

### El código de vinculación no funciona

1. **Espera 10-15 segundos** después de iniciar el servicio
2. Verifica que el servicio esté corriendo:
   ```bash
   docker compose ps
   ```
3. Revisa los logs:
   ```bash
   docker logs nexora-whatsapp -f
   ```

### Error: "Session not found"

La sesión aún no se ha inicializado. Espera unos segundos y vuelve a intentar.

### Error: "Pairing code method not available"

Asegúrate de tener la última versión de Baileys. El código ya está actualizado.

### Desconectar y reconectar

```bash
# Resetear la conexión de WhatsApp
curl -X POST http://localhost:3011/wa/reset

# Espera 10 segundos
sleep 10

# Solicita un nuevo código
./scripts/request-pairing-code.sh +TU_NUMERO
```

---

## 📝 Notas Importantes

1. **Usa tu propio número**: El número que ingresas debe ser el mismo que tienes registrado en WhatsApp
2. **Solo un dispositivo activo**: Si ya tienes WhatsApp Web abierto en otro lugar, ciérralo primero
3. **Los códigos expiran**: Si no ingresas el código rápido, solicita uno nuevo
4. **Mantén el servicio corriendo**: No detengas el contenedor mientras estés conectado

---

## 🚀 Siguiente Paso

Una vez conectado, tu sistema estará listo para:
- ✅ Recibir mensajes de WhatsApp
- ✅ Enviar mensajes automáticos
- ✅ Procesar leads con IA
- ✅ Gestionar conversaciones en el CRM
