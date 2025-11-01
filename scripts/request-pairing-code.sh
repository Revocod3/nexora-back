#!/bin/bash

# Script para solicitar código de vinculación de WhatsApp
# Uso: ./scripts/request-pairing-code.sh +5215512345678

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Debes proporcionar un número de teléfono${NC}"
    echo ""
    echo "Uso: $0 <número_de_teléfono>"
    echo ""
    echo "Ejemplos:"
    echo "  $0 +5215512345678"
    echo "  $0 5215512345678"
    echo "  $0 525512345678"
    echo ""
    echo "El número debe incluir código de país (sin el +)"
    exit 1
fi

# Limpiar el número (remover espacios, guiones, paréntesis, +)
PHONE_NUMBER=$(echo "$1" | sed 's/[^0-9]//g')

echo -e "${BLUE}📱 Solicitando código de vinculación para: ${GREEN}${PHONE_NUMBER}${NC}"
echo ""

# Hacer la solicitud al servicio
RESPONSE=$(curl -s -X POST http://localhost:3011/wa/pair \
  -H "Content-Type: application/json" \
  -d "{\"phoneNumber\": \"${PHONE_NUMBER}\"}")

# Verificar si hay error
if echo "$RESPONSE" | grep -q '"ok":true'; then
    CODE=$(echo "$RESPONSE" | grep -o '"code":"[^"]*"' | cut -d'"' -f4)
    
    echo -e "${GREEN}✅ Código de vinculación generado exitosamente!${NC}"
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    echo -e "${GREEN}   CÓDIGO DE VINCULACIÓN: ${CODE}${NC}"
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    echo ""
    echo "📲 Pasos para vincular WhatsApp:"
    echo ""
    echo "1. Abre WhatsApp en tu teléfono"
    echo "2. Ve a: Configuración > Dispositivos Vinculados"
    echo "3. Toca: 'Vincular un dispositivo'"
    echo "4. Selecciona: 'Vincular con número de teléfono'"
    echo "5. Ingresa el código: ${CODE}"
    echo ""
    echo "⏱️  El código expira en unos minutos"
    echo ""
else
    echo -e "${RED}❌ Error al generar el código${NC}"
    echo ""
    echo "Respuesta del servidor:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    echo ""
    
    # Verificar si el servicio está corriendo
    echo "🔍 Verificando estado del servicio..."
    if curl -s http://localhost:3011/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ El servicio WhatsApp está corriendo${NC}"
        echo ""
        echo "💡 Posibles causas del error:"
        echo "  - La sesión aún no se ha inicializado completamente"
        echo "  - El número de teléfono es inválido"
        echo "  - Ya hay una sesión activa"
        echo ""
        echo "Intenta:"
        echo "  1. Esperar unos segundos y volver a intentar"
        echo "  2. Verificar los logs: docker logs nexora-whatsapp -f"
    else
        echo -e "${RED}❌ El servicio WhatsApp no está respondiendo${NC}"
        echo "Ejecuta: docker compose ps"
    fi
    exit 1
fi
