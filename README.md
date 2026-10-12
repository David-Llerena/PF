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

### Fase 2 — Tarjetas y obligaciones ✅

| Módulo | Estado |
|---|---|
| Tarjetas: banco, red, cupo, corte, pago, últimos 4 dígitos (nunca número completo, CVV ni PIN) | ✅ |
| Deuda, cupo disponible, utilización, consumos por período (navegable por cortes) | ✅ |
| Pago del período **estimado** (consumos del ciclo + cuotas que vencen − pagos) vs. pago total | ✅ |
| Consumos corrientes y **diferidos** con cronograma automático (con o sin intereses) | ✅ |
| Deuda inicial y **diferidos previos** a la app (entran como deuda, no como gasto) | ✅ |
| Pagos de tarjeta: bajan cuenta y deuda, no son gasto | ✅ |
| Préstamos con amortización (francés) sobre saldo y cuotas restantes; deudas simples | ✅ |
| Pago de cuota: capital (no gasto) + intereses/cargos (gasto), anulables juntos | ✅ |
| Préstamo recibido en cuenta: sube el saldo, no es ingreso | ✅ |
| Recurrentes (suscripciones, servicios, ingresos): registrar, omitir, pausar; total mensual | ✅ |
| Próximas obligaciones consolidadas (tarjetas, cuotas, recurrentes, pendientes) en el dashboard | ✅ |
| Onboarding con tarjeta e ingreso recurrente; datos demo de Fase 2 | ✅ |

### Fase 3 — Planificación y análisis ✅

| Módulo | Estado |
|---|---|
| Presupuestos mensuales por categoría (asignado, consumido, restante, %), alertas al 80 % y 100 %, copiar del mes anterior | ✅ |
| Metas de ahorro como **reservas** del saldo (no se cuentan dos veces; la BD impide reservar más de lo disponible) | ✅ |
| Calendario de pagos (cuadrícula y agenda): pagados, próximos, pendientes y vencidos, sin duplicados | ✅ |
| Reportes por rango de meses, cuenta/tarjeta y categoría: ingresos vs. gastos, ahorro, saldo/deuda/patrimonio, gastos principales, obligaciones futuras | ✅ |
| **¿Cuánto me quedará el próximo mes?** — línea por línea, confirmado vs. programado vs. estimado, saldo día a día, punto más bajo y advertencias | ✅ |

### Fase 4 — Calidad y producción ✅

| Ítem | Estado |
|---|---|
| Responsive (móvil con navegación inferior y “Más”, tablet, escritorio), áreas seguras de iPhone, sin scroll horizontal | ✅ |
| PWA instalable, modo claro/oscuro | ✅ |
| Content-Security-Policy, HSTS, `Cache-Control: private, no-store` en páginas con datos | ✅ |
| Exportación de movimientos a CSV (respaldo, con protección contra inyección de fórmulas) | ✅ |
| Pruebas: 46 unitarias + 4 suites SQL (reglas, RLS, Fases 2 y 3) | ✅ |

### Limitaciones conocidas (no simuladas)

- El **pago mínimo** de tarjeta depende de cada banco y no se calcula: se registra como "Otro valor".
- Los intereses de un diferido con interés se reconocen como gasto en la fecha de compra (simplificación explícita).
- La proyección no adivina consumos futuros con tarjeta; usa el promedio de gastos variables pagados con cuentas (últimos 3 meses) y lo marca como estimado.
- Sin pruebas E2E automatizadas en navegador contra Supabase real; la verificación visual se hizo con un backend simulado.

---

## Modelo financiero

Todo movimiento vive en `financial_transactions` (libro mayor). **El saldo nunca se almacena**: la vista `account_balances` lo deriva de los movimientos `confirmed`. Editar, confirmar o anular un movimiento mantiene la consistencia automáticamente.

| `kind` | Efecto en saldo | ¿Ingreso/gasto del período? |
|---|---|---|
| `opening` (saldo inicial) | ± en la cuenta | No |
| `income` | + en la cuenta | Ingreso |
| `expense` | − en la cuenta | Gasto |
| `transfer` | − origen, + destino (una sola fila) | No |
| `adjustment` (motivo obligatorio) | ± en la cuenta (o en la tarjeta) | No |
| `expense` con tarjeta | sube la deuda de la tarjeta; no toca cuentas | Gasto |
| `card_opening` (deuda inicial / diferido previo) | sube la deuda | No |
| `card_payment` | − en la cuenta y − en la deuda | No |
| `loan_disbursement` | + en la cuenta | No (no es ingreso) |
| `loan_payment` (capital) | − en la cuenta y − en el préstamo | No |

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
  services/        Consultas de lectura (solo servidor): finance.ts, obligations.ts (tarjetas, préstamos, recurrentes) y planning.ts (presupuestos, metas, reportes, proyección, calendario)
  app/api/export   Exportación CSV de movimientos
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
   - SQL Editor de Supabase: pega y ejecuta, en orden, `…0001_core_schema.sql`, `…0002_demo_data.sql`, `…0003_cards_loans_recurring.sql` y `…0004_budgets_goals_reports.sql`. Si ya aplicaste algunas, ejecuta solo las que faltan: tus datos se conservan.
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
- Content-Security-Policy restringida a recursos propios y a tu proyecto de Supabase; páginas con datos marcadas `private, no-store`.
- Recomendado en Supabase → Authentication: activar confirmación de correo, longitud mínima de contraseña 8 y protección contra contraseñas filtradas.

## Pruebas incluidas

- **Unitarias (Vitest, 46):** presupuestos, progreso de metas, reservas sin doble conteo, proyección (horizonte, eventos sin duplicar, separación programado/estimado, advertencias), cronogramas (francés y sin interés, día ancla), ciclos de corte/pago, estimado del período, cupo y utilización, recurrencias (espejo del SQL), precisión decimal (0.1 + 0.2), parseo de importes en formato local, saldos con pendientes/anulados, transferencias que no alteran ingresos/gastos ni el total de activos, saldo corrido, patrimonio, zona horaria de Ecuador, validaciones.
- **SQL Fase 3:** consumo de presupuesto (cuenta + tarjeta, sin pendientes), validaciones, copia sin duplicar, reservas que no alteran saldos ni superan lo disponible, liberación y archivo, reportes con filtros, posición mensual, aislamiento y demo completa.
- **SQL Fase 2:** consumo con tarjeta no toca bancos, diferido cuenta como gasto una sola vez, cronograma que no cuadra se rechaza, diferido previo no es gasto, pago de tarjeta no es gasto, anulación de diferidos y pagos agrupados, préstamo recibido no es ingreso, solo el interés es gasto, doble pago rechazado, recurrentes, aislamiento entre usuarios y demo completa.
- **SQL Fase 1:** saldos derivados, transferencias, pendientes, confirmación, anulación, ajustes con motivo y auditoría, cambio de saldo inicial, restricciones de integridad, cuenta predeterminada única, aislamiento entre usuarios (lectura, escritura y referencias cruzadas) y carga/borrado de datos demo.
