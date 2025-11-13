#!/bin/bash

###############################################################################
# Script para insertar datos de prueba en Nexora Backend
###############################################################################

echo "🌱 Insertando datos de prueba en la base de datos..."

# Tenant ID (debe coincidir con SINGLE_TENANT_ID en .env)
TENANT_ID="01624ba8-f6ec-4c9a-8e20-27052429f50e"

# Conectar a PostgreSQL en Docker
docker exec -i nexora-postgres psql -U nexora_user -d nexora_db << EOF

-- Crear tenant si no existe
INSERT INTO tenants (id, name, created_at, updated_at)
VALUES ('${TENANT_ID}', 'Salón de Belleza Demo', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    updated_at = NOW();

-- Insertar servicios de ejemplo
INSERT INTO services (id, tenant_id, name, description, duration_minutes, price, currency, status, metadata, created_at, updated_at)
VALUES 
    (gen_random_uuid(), '${TENANT_ID}', 'Corte de Pelo', 'Corte clásico con lavado y secado', 30, 25.00, 'EUR', 'active', '{"category":"peluqueria","features":["Lavado","Secado","Peinado"]}', NOW(), NOW()),
    (gen_random_uuid(), '${TENANT_ID}', 'Tinte Completo', 'Tinte de raíces y puntas con tratamiento', 90, 65.00, 'EUR', 'active', '{"category":"coloracion","features":["Tinte","Tratamiento","Lavado"]}', NOW(), NOW()),
    (gen_random_uuid(), '${TENANT_ID}', 'Manicura', 'Manicura completa con esmaltado', 45, 20.00, 'EUR', 'active', '{"category":"manos","features":["Limado","Esmaltado","Hidratación"]}', NOW(), NOW()),
    (gen_random_uuid(), '${TENANT_ID}', 'Pedicura', 'Pedicura completa con masaje', 60, 30.00, 'EUR', 'active', '{"category":"pies","features":["Exfoliación","Masaje","Esmaltado"]}', NOW(), NOW()),
    (gen_random_uuid(), '${TENANT_ID}', 'Mechas Californianas', 'Mechas naturales con técnica californiana', 120, 95.00, 'EUR', 'active', '{"category":"coloracion","features":["Mechas","Tono natural","Lavado"]}', NOW(), NOW()),
    (gen_random_uuid(), '${TENANT_ID}', 'Tratamiento Capilar', 'Tratamiento intensivo con keratina', 45, 35.00, 'EUR', 'active', '{"category":"tratamientos","features":["Keratina","Hidratación","Brillo"]}', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Insertar usuarios/clientes de ejemplo
INSERT INTO users (id, tenant_id, phone_e164, name, created_at, updated_at)
VALUES 
    (gen_random_uuid(), '${TENANT_ID}', '+34611111111', 'María García', NOW(), NOW()),
    (gen_random_uuid(), '${TENANT_ID}', '+34622222222', 'Ana López', NOW(), NOW()),
    (gen_random_uuid(), '${TENANT_ID}', '+34633333333', 'Carmen Rodríguez', NOW(), NOW()),
    (gen_random_uuid(), '${TENANT_ID}', '+34644444444', 'Laura Martínez', NOW(), NOW()),
    (gen_random_uuid(), '${TENANT_ID}', '+34655555555', 'Isabel Sánchez', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Insertar citas de ejemplo (algunas pasadas, algunas futuras)
WITH service_ids AS (
    SELECT id, name FROM services WHERE tenant_id = '${TENANT_ID}' LIMIT 6
),
user_ids AS (
    SELECT id, phone_e164 FROM users WHERE tenant_id = '${TENANT_ID}' LIMIT 5
)
INSERT INTO appointments (id, tenant_id, service_id, user_id, scheduled_at, status, customer_name, customer_phone, notes, created_at, updated_at, completed_at)
SELECT 
    gen_random_uuid(),
    '${TENANT_ID}',
    (SELECT id FROM service_ids ORDER BY random() LIMIT 1),
    (SELECT id FROM user_ids ORDER BY random() LIMIT 1),
    CASE 
        WHEN random() < 0.3 THEN NOW() - INTERVAL '7 days' + (random() * INTERVAL '5 days')
        WHEN random() < 0.6 THEN NOW() + INTERVAL '1 hour' + (random() * INTERVAL '8 hours')
        ELSE NOW() + INTERVAL '1 day' + (random() * INTERVAL '7 days')
    END,
    CASE 
        WHEN random() < 0.2 THEN 'completed'::appointments_status_enum
        WHEN random() < 0.4 THEN 'confirmed'::appointments_status_enum
        WHEN random() < 0.6 THEN 'pending'::appointments_status_enum
        ELSE 'cancelled'::appointments_status_enum
    END,
    NULL,
    NULL,
    CASE WHEN random() < 0.3 THEN 'Cliente VIP' ELSE NULL END,
    NOW(),
    NOW(),
    CASE WHEN random() < 0.2 THEN NOW() - INTERVAL '1 day' ELSE NULL END
FROM generate_series(1, 15);

-- Actualizar completed_at para citas completadas
UPDATE appointments 
SET completed_at = scheduled_at + INTERVAL '1 hour'
WHERE status = 'completed' AND completed_at IS NULL;

EOF

echo ""
echo "✅ Datos de prueba insertados correctamente!"
echo ""
echo "📊 Resumen:"
docker exec nexora-postgres psql -U nexora_user -d nexora_db -c "SELECT COUNT(*) as servicios FROM services WHERE tenant_id = '${TENANT_ID}';"
docker exec nexora-postgres psql -U nexora_user -d nexora_db -c "SELECT COUNT(*) as clientes FROM users WHERE tenant_id = '${TENANT_ID}';"
docker exec nexora-postgres psql -U nexora_user -d nexora_db -c "SELECT status, COUNT(*) as cantidad FROM appointments WHERE tenant_id = '${TENANT_ID}' GROUP BY status;"
echo ""
echo "🚀 Prueba los endpoints ahora:"
echo "   curl http://localhost:8000/api/services"
echo "   curl http://localhost:8000/api/appointments"
echo "   curl http://localhost:8000/api/dashboard/stats"
echo "   curl http://localhost:8000/api/clients"
echo ""
