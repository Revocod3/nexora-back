# OpenAI Agents Setup

## Iniciar
```bash
pnpm run start:dev
```

## Seed de Servicios
```bash
SEED_CLIENT_ID=<client-uuid> pnpm run seed
```

## Usar
El agente escucha automáticamente mensajes de WhatsApp vía Redis.

**Flujo:**
1. Cliente: "Hola, quiero cortarme el pelo"
2. Agente pregunta nombre, fecha preferida
3. Verifica disponibilidad automáticamente
4. Confirma datos antes de crear cita
5. Crea cita y envía confirmación

## Tools Disponibles
- `get_services` - Lista servicios
- `check_availability` - Horarios libres
- `create_appointment` - Crear cita
- `find_appointments` - Buscar citas
- `cancel_appointment` - Cancelar

## Conversation History
Se guarda automáticamente en Redis por 1 hora por cada número de teléfono.
