<<<<<<< HEAD
# PF
=======
# Finanzas Personales

Aplicación web (PWA) para administrar finanzas personales: cuentas, ingresos, gastos, transferencias y, en próximas fases, tarjetas de crédito, préstamos, presupuestos y proyecciones. Moneda USD, configuración regional Ecuador (`America/Guayaquil`).

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · componentes estilo shadcn/ui (Radix) · Lucide · Supabase (PostgreSQL + Auth + RLS) · Recharts · React Hook Form + Zod · decimal.js · Vitest.

---

## Estado del proyecto

### Fase 1 — Fundación y MVP operativo ✅

| Módulo | Estado |
|---|---|
| Registro, login, logout, recuperación de contraseña, rutas protegidas | ✅ |
| Perfil básico, modo claro/oscuro | ✅ |
| Cuentas (corriente, ahorros, efectivo, billetera) con instituciones ecuatorianas o propias | ✅ |
| Saldo inicial, cuenta predeterminada, desactivar/reactivar, historial con saldo corrido | ✅ |
| Ajustes de saldo con motivo obligatorio (auditados) | ✅ |
| Ingresos y gastos (pendiente/confirmado, fijo/variable, medio de pago) | ✅ |
| Transferencias entre cuentas propias | ✅ |
| Editar, confirmar y anular movimientos | ✅ |
| Historial con filtros (mes, tipo, cuenta, categoría, medio de pago, estado, importe, búsqueda) | ✅ |
| Categorías propias (crear, renombrar, desactivar) | ✅ |
| Dashboard con datos reales, filtro de mes/año, gráfico 6 meses, gastos por categoría, pendientes | ✅ |
| Configuración inicial (onboarding) y datos demo opcionales y separados | ✅ |
| PWA instalable (manifest, íconos, service worker sin caché de datos financieros) | ✅ |

### Pendiente (no simulado)

- **Fase 2:** tarjetas de crédito (cupo, consumos, diferidos, cronograma de cuotas, pagos), préstamos con amortización, suscripciones, ingresos recurrentes. Hasta entonces, el dashboard muestra *Deudas = $0,00* y el medio de pago "tarjeta de crédito" está deshabilitado en gastos para no descontar consumos de una cuenta bancaria.
- **Fase 3:** presupuestos, metas de ahorro, calendario de pagos, reportes y proyección del próximo mes.
- **Fase 4:** pruebas E2E, optimizaciones finales y endurecimiento adicional.

Las tablas de Fase 2/3 se crearán en migraciones nuevas junto con su lógica, para diseñarlas sobre el libro mayor existente en lugar de adelantar un esquema sin uso.

---

## Modelo financiero

Todo movimiento vive en `financial_transactions` (libro mayor). **El saldo nunca se almacena**: la vista `account_balances` lo deriva de los movimientos `confirmed`. Editar, confirmar o anular un movimiento mantiene la consistencia automáticamente.

| `kind` | Efecto en saldo | ¿Ingreso/gasto del período? |
|---|---|---|
| `opening` (saldo inicial) | ± en la cuenta | No |
| `income` | + en la cuenta | Ingreso |
| `expense` | − en la cuenta | Gasto |
| `transfer` | − origen, + destino (una sola fila) | No |
| `adjustment` (motivo obligatorio) | ± en la cuenta | No |

- `status`: `pending` (no afecta saldo), `confirmed`, `void` (anulado, se conserva).
- Importes `numeric(14,2)` siempre positivos; el signo lo da `direction`. Totales calculados en SQL y devueltos como texto; en TypeScript se usa `decimal.js` (nunca `number` para sumar dinero).
- Fechas como `date` local de Ecuador.
- Un trigger valida que cuentas y categorías referenciadas pertenezcan al mismo usuario (RLS no impide referenciar un id ajeno en una FK).
- `audit_log` registra INSERT/UPDATE/DELETE de `accounts` y `financial_transactions` (solo lectura para el usuario).
- Reglas centralizadas en `src/lib/finance/rules.ts` (espejo de la lógica SQL).

---

## Estructura

```
src/
  actions/         Server Actions (auth, cuentas, movimientos, ajustes) — validan sesión y Zod
  app/(auth)/      Login, registro, recuperación
  app/(app)/       Dashboard, movimientos, cuentas, configuración (rutas privadas)
  app/bienvenida/  Configuración inicial
  components/      UI, layout, formularios, dashboard
  lib/             money, dates, reglas financieras, validaciones, tipos, clientes Supabase
  services/        Consultas de lectura (solo servidor)
  middleware.ts    Refresco de sesión y protección de rutas
supabase/
  migrations/      Esquema, RLS, vistas, funciones, datos demo
  tests/           Pruebas SQL de reglas financieras y aislamiento RLS
```

---

## Configuración local

Requisitos: Node.js ≥ 20.9 y una cuenta gratuita de [Supabase](https://supabase.com).

1. **Crear proyecto en Supabase** y copiar *Project URL* y *anon public key* (Project Settings → API).
2. **Aplicar migraciones** (en orden), con una de estas opciones:
   - SQL Editor de Supabase: pega y ejecuta `supabase/migrations/20261012000001_core_schema.sql` y luego `20261012000002_demo_data.sql`.
   - Supabase CLI: `supabase link --project-ref <ref>` y `supabase db push`.
3. **Variables de entorno:**
   ```bash
   cp .env.example .env.local   # completa URL y anon key
   ```
4. **Auth en Supabase** (Authentication → URL Configuration):
   - *Site URL*: `http://localhost:3000` (en producción, tu dominio de Vercel).
   - *Redirect URLs*: agrega `http://localhost:3000/auth/callback` y `https://TU-DOMINIO/auth/callback`.
   - La confirmación de correo puede quedar activada (recomendado).
5. **Ejecutar:**
   ```bash
   npm install
   npm run dev
   ```

### Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm test` | Pruebas unitarias (dinero, fechas, reglas, validaciones) |
| `npm run typecheck` / `npm run lint` | TypeScript y ESLint |
| `npm run test:db` | Pruebas SQL contra una BD PostgreSQL **vacía de pruebas** (`DATABASE_URL=...`). No usar contra Supabase. |

---

## Despliegue en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel: **Add New → Project**, importa el repositorio (framework Next.js detectado automáticamente).
3. En **Environment Variables** agrega `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SITE_URL` (p. ej. `https://tu-app.vercel.app`).
4. Deploy. Luego actualiza *Site URL* y *Redirect URLs* en Supabase con el dominio final.

No se necesita (ni se debe configurar) la `service role key`.

### Instalar como app

- **iPhone (Safari):** Compartir → *Agregar a pantalla de inicio*.
- **Android (Chrome):** menú → *Instalar aplicación*.

---

## Seguridad

- RLS en todas las tablas; las cuentas y movimientos no tienen política `DELETE` (se desactivan/anulan).
- Server Actions verifican la sesión con `auth.getUser()` y validan entradas con Zod; la BD vuelve a validar con `CHECK`s y triggers.
- Solo la anon key llega al navegador. Encabezados de seguridad configurados en `next.config.ts`.
- El service worker no cachea páginas ni respuestas con datos financieros.
- No se almacenan credenciales bancarias, números completos de tarjeta, CVV ni PIN.

## Pruebas incluidas

- **Unitarias (Vitest, 22):** precisión decimal (0.1 + 0.2), parseo de importes en formato local, saldos con pendientes/anulados, transferencias que no alteran ingresos/gastos ni el total de activos, saldo corrido, patrimonio, zona horaria de Ecuador, validaciones.
- **SQL:** saldos derivados, transferencias, pendientes, confirmación, anulación, ajustes con motivo y auditoría, cambio de saldo inicial, restricciones de integridad, cuenta predeterminada única, aislamiento entre usuarios (lectura, escritura y referencias cruzadas) y carga/borrado de datos demo.
>>>>>>> 5bdad59 (agreacion fase 1 fp)
