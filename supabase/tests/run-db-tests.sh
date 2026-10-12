#!/usr/bin/env bash
# Ejecuta las migraciones y las pruebas SQL contra una base PostgreSQL desechable.
# Uso: DATABASE_URL=postgres://usuario@localhost:5432/finanzas_test npm run test:db
# ¡No lo ejecutes contra tu proyecto de Supabase! Crea roles y un esquema auth de prueba.
set -euo pipefail
: "${DATABASE_URL:?Define DATABASE_URL apuntando a una base de datos VACÍA de pruebas}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$DIR/tests/_supabase_stub.sql"
for f in "$DIR"/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"; done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$DIR/tests/financial_rules.test.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$DIR/tests/phase2_rules.test.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$DIR/tests/phase3_rules.test.sql"
