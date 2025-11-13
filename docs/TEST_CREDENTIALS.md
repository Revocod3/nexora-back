# Test Credentials - Nexora Backend

## Usuario de Prueba Creado

### Credenciales
```json
{
  "email": "test@demo.com",
  "password": "Demo123456"
}
```

### Tenant Asociado
- **Nombre**: Salon Demo
- **Subdomain**: demo
- **Email del tenant**: contact@demo.com

---

## Probar el Login

### Endpoint
```
POST http://localhost:8000/api/auth/login
```

### Request Body
```json
{
  "email": "test@demo.com",
  "password": "Demo123456"
}
```

### Opción con subdomain (opcional)
```json
{
  "email": "test@demo.com",
  "password": "Demo123456",
  "subdomain": "demo"
}
```

---

## Respuesta Esperada

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tenant": {
    "id": "1a970e93-66ed-4d3c-a2f0-16f39b7b36de",
    "name": "Salon Demo",
    "email": "contact@demo.com",
    "subdomain": "demo",
    "whatsapp_number": null
  },
  "user": {
    "id": "7f92b7f6-210f-48fd-a027-a93fb3761c9e",
    "name": "Test User",
    "email": "test@demo.com",
    "role": "OWNER"
  }
}
```

---

## Cómo usar el Token JWT en el Frontend

### 1. Guardar el token después del login
```typescript
const response = await fetch('http://localhost:8000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@demo.com',
    password: 'Demo123456'
  })
});

const data = await response.json();
localStorage.setItem('access_token', data.access_token);
```

### 2. Incluir el token en todas las peticiones
```typescript
const token = localStorage.getItem('access_token');

const response = await fetch('http://localhost:8000/api/dashboard', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### 3. Configurar un interceptor (Axios)
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api'
});

// Request interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Usar en tu app
const dashboard = await api.get('/dashboard');
```

### 4. Configurar un interceptor (Fetch)
```typescript
const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('access_token');

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`http://localhost:8000/api${url}`, {
    ...options,
    headers
  });
};

// Usar en tu app
const response = await apiFetch('/dashboard');
const data = await response.json();
```

---

## Endpoints Disponibles con JWT

Una vez autenticado, puedes acceder a:

### Dashboard
```bash
GET /api/dashboard
Authorization: Bearer <token>
```

### Clients
```bash
GET /api/clients
POST /api/clients
GET /api/clients/:id
PATCH /api/clients/:id
DELETE /api/clients/:id
Authorization: Bearer <token>
```

### Services
```bash
GET /api/services
POST /api/services
GET /api/services/:id
PATCH /api/services/:id
POST /api/services/:id/deactivate
Authorization: Bearer <token>
```

### Appointments
```bash
GET /api/appointments
POST /api/appointments
GET /api/appointments/:id
PATCH /api/appointments/:id
DELETE /api/appointments/:id
Authorization: Bearer <token>
```

### WhatsApp
```bash
GET /api/whatsapp/status
GET /api/whatsapp/qr
POST /api/whatsapp/number
POST /api/whatsapp/logout
Authorization: Bearer <token>
```

### User Info
```bash
GET /api/auth/me
Authorization: Bearer <token>
```

---

## Ejemplo Completo con React

```typescript
import { useState, useEffect } from 'react';

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState(null);

  const login = async () => {
    const response = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@demo.com',
        password: 'Demo123456'
      })
    });

    const data = await response.json();
    setToken(data.access_token);
    setUser(data.user);
    localStorage.setItem('access_token', data.access_token);
  };

  const fetchDashboard = async () => {
    const response = await fetch('http://localhost:8000/api/dashboard', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('Dashboard:', data);
  };

  useEffect(() => {
    // Cargar token al iniciar
    const savedToken = localStorage.getItem('access_token');
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  return (
    <div>
      <h1>Nexora CRM</h1>
      {!token ? (
        <button onClick={login}>Login</button>
      ) : (
        <>
          <p>Logged in as: {user?.name}</p>
          <button onClick={fetchDashboard}>Get Dashboard</button>
        </>
      )}
    </div>
  );
}
```

---

## Troubleshooting

### Error 401 Unauthorized
- Verifica que el token esté presente en el header `Authorization`
- Verifica que el formato sea: `Bearer <token>`
- El token expira en 7 días, verifica que no haya expirado

### Error de CORS
- Verifica que `FRONTEND_URL` en el backend esté configurado correctamente
- Asegúrate de que el frontend esté corriendo en la URL configurada

### Token expirado
- Vuelve a hacer login para obtener un nuevo token
- El token expira en 7 días (configurable con `JWT_EXPIRES_IN`)

---

## Notas

- ✅ El backend está corriendo en `http://localhost:8000`
- ✅ Helmet está desactivado temporalmente para desarrollo
- ✅ JWT está configurado y funcionando
- ✅ Todas las rutas excepto `/api/auth/login` y `/api/auth/signup` requieren JWT
- ⚠️ Recordar reactivar Helmet antes de ir a producción
