#!/bin/sh
# Start bundled PostgreSQL, the SparkyFitness API, and Nginx in one add-on
# container. Secrets are generated once and persisted under /data.
set -eu

DATA_DIR=/data
PGDATA="${DATA_DIR}/postgres"
SECRETS_FILE="${DATA_DIR}/secrets.env"
OPTIONS_FILE="${DATA_DIR}/options.json"
UPLOADS_DIR="${DATA_DIR}/uploads"
BACKUP_DIR="${DATA_DIR}/backup"
SOCKET_DIR=/run/postgresql

log() {
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

for bindir in /usr/libexec/postgresql18 /usr/lib/postgresql/18/bin /usr/bin; do
  if [ -x "${bindir}/initdb" ]; then
    export PATH="${bindir}:${PATH}"
    break
  fi
done
command -v initdb >/dev/null 2>&1 || die "initdb not found (postgresql18 package missing?)"
command -v postgres >/dev/null 2>&1 || die "postgres binary not found"

if [ ! -f "${OPTIONS_FILE}" ]; then
  log "No options.json yet; using defaults"
  OPTIONS_FILE=/tmp/options.json
  printf '%s\n' '{}' > "${OPTIONS_FILE}"
fi

opt() {
  jq -r --arg key "$1" --arg default "$2" \
    '.[$key] // $default' "${OPTIONS_FILE}"
}

FRONTEND_URL=$(opt frontend_url "http://homeassistant.local:3004")
TIMEZONE=$(opt timezone "Etc/UTC")
DISABLE_SIGNUP=$(opt disable_signup "false")
ADMIN_EMAIL=$(opt admin_email "")
LOG_LEVEL=$(opt log_level "ERROR")
EXTRA_ORIGINS=$(opt extra_trusted_origins "")

mkdir -p "${PGDATA}" "${UPLOADS_DIR}" "${BACKUP_DIR}" "${SOCKET_DIR}"
chmod 700 "${PGDATA}" || true

if [ ! -f "${SECRETS_FILE}" ]; then
  log "Generating persistent secrets in ${SECRETS_FILE}"
  umask 077
  cat > "${SECRETS_FILE}" <<EOF
SPARKY_FITNESS_DB_NAME=sparkyfitness_db
SPARKY_FITNESS_DB_USER=sparky
SPARKY_FITNESS_DB_PASSWORD=$(openssl rand -hex 16)
SPARKY_FITNESS_APP_DB_USER=sparky_app
SPARKY_FITNESS_APP_DB_PASSWORD=$(openssl rand -hex 16)
SPARKY_FITNESS_API_ENCRYPTION_KEY=$(openssl rand -hex 32)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
EOF
  chmod 600 "${SECRETS_FILE}"
fi

# shellcheck disable=SC1090
. "${SECRETS_FILE}"

export \
  SPARKY_FITNESS_DB_HOST=127.0.0.1 \
  SPARKY_FITNESS_DB_PORT=5432 \
  SPARKY_FITNESS_DB_NAME \
  SPARKY_FITNESS_DB_USER \
  SPARKY_FITNESS_DB_PASSWORD \
  SPARKY_FITNESS_APP_DB_USER \
  SPARKY_FITNESS_APP_DB_PASSWORD \
  SPARKY_FITNESS_FRONTEND_URL="${FRONTEND_URL}" \
  SPARKY_FITNESS_API_ENCRYPTION_KEY \
  BETTER_AUTH_SECRET \
  SPARKY_FITNESS_DISABLE_SIGNUP="${DISABLE_SIGNUP}" \
  SPARKY_FITNESS_ADMIN_EMAIL="${ADMIN_EMAIL}" \
  SPARKY_FITNESS_LOG_LEVEL="${LOG_LEVEL}" \
  SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS="${EXTRA_ORIGINS}" \
  SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY="${UPLOADS_DIR}" \
  SPARKY_FITNESS_CUSTOM_BACKUP_DIRECTORY="${BACKUP_DIR}" \
  SPARKY_FITNESS_SERVER_HOST=127.0.0.1 \
  SPARKY_FITNESS_SERVER_PORT=3010 \
  ALLOW_PRIVATE_NETWORK_CORS=true \
  NODE_ENV=production \
  TZ="${TIMEZONE}" \
  NGINX_LISTEN_PORT="${NGINX_LISTEN_PORT:-80}" \
  NGINX_RATE_LIMIT="${NGINX_RATE_LIMIT:-5r/s}" \
  NGINX_ACCESS_LOG="${NGINX_ACCESS_LOG:-/dev/stdout}" \
  NGINX_ERROR_LOG="${NGINX_ERROR_LOG:-/dev/stderr}"

if [ -n "${TIMEZONE}" ] && [ -f "/usr/share/zoneinfo/${TIMEZONE}" ]; then
  ln -sf "/usr/share/zoneinfo/${TIMEZONE}" /etc/localtime
  echo "${TIMEZONE}" > /etc/timezone
fi

if ! id postgres >/dev/null 2>&1; then
  addgroup -S postgres 2>/dev/null || true
  adduser -S -D -H -h /var/lib/postgresql -G postgres postgres
fi
chown -R postgres:postgres "${PGDATA}" "${SOCKET_DIR}"

if [ ! -s "${PGDATA}/PG_VERSION" ]; then
  log "Initializing PostgreSQL cluster"
  PWFILE=$(mktemp)
  chmod 600 "${PWFILE}"
  printf '%s\n' "${SPARKY_FITNESS_DB_PASSWORD}" > "${PWFILE}"
  chown postgres:postgres "${PWFILE}"
  su-exec postgres initdb \
    --pgdata="${PGDATA}" \
    --username="${SPARKY_FITNESS_DB_USER}" \
    --pwfile="${PWFILE}" \
    --auth-host=scram-sha-256 \
    --auth-local=trust \
    --encoding=UTF8 \
    --locale=C
  rm -f "${PWFILE}"
fi

log "Starting PostgreSQL"
su-exec postgres postgres \
  -D "${PGDATA}" \
  -c listen_addresses=127.0.0.1 \
  -c port=5432 \
  -c unix_socket_directories="${SOCKET_DIR}" \
  -c shared_buffers=64MB \
  -c huge_pages=off \
  -c logging_collector=off \
  -c log_min_messages=warning &
PG_PID=$!

i=0
while [ "${i}" -lt 60 ]; do
  if pg_isready -h "${SOCKET_DIR}" -p 5432 -U "${SPARKY_FITNESS_DB_USER}" >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done
pg_isready -h "${SOCKET_DIR}" -p 5432 -U "${SPARKY_FITNESS_DB_USER}" >/dev/null 2>&1 \
  || die "PostgreSQL did not become ready"

DB_EXISTS=$(psql -h "${SOCKET_DIR}" -U "${SPARKY_FITNESS_DB_USER}" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${SPARKY_FITNESS_DB_NAME}'" || true)
if [ "${DB_EXISTS}" != "1" ]; then
  log "Creating database ${SPARKY_FITNESS_DB_NAME}"
  psql -h "${SOCKET_DIR}" -U "${SPARKY_FITNESS_DB_USER}" -d postgres \
    -c "CREATE DATABASE ${SPARKY_FITNESS_DB_NAME}"
fi

log "Starting SparkyFitness server"
cd /app/SparkyFitnessServer
./node_modules/.bin/tsx index.ts &
SERVER_PID=$!

i=0
while [ "${i}" -lt 90 ]; do
  if curl -fsS "http://127.0.0.1:3010/api/health" >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done
if ! curl -fsS "http://127.0.0.1:3010/api/health" >/dev/null 2>&1; then
  log "WARNING: API health check did not succeed yet; starting Nginx anyway"
fi

log "Generating Nginx config"
envsubst \
  "\$SPARKY_FITNESS_SERVER_HOST \$SPARKY_FITNESS_SERVER_PORT \$NGINX_RATE_LIMIT \$SPARKY_FITNESS_FRONTEND_URL \$NGINX_LISTEN_PORT \$NGINX_ACCESS_LOG \$NGINX_ERROR_LOG" \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf
nginx -t || die "Invalid Nginx configuration"

cleanup() {
  log "Stopping SparkyFitness"
  if [ -n "${NGINX_PID:-}" ]; then
    kill "${NGINX_PID}" 2>/dev/null || true
  fi
  if [ -n "${SERVER_PID:-}" ]; then
    kill "${SERVER_PID}" 2>/dev/null || true
  fi
  if [ -n "${PG_PID:-}" ]; then
    kill "${PG_PID}" 2>/dev/null || true
    wait "${PG_PID}" 2>/dev/null || true
  fi
}

trap 'cleanup; exit 0' INT TERM

log "SparkyFitness is up at ${FRONTEND_URL}"
nginx -g "daemon off;" &
NGINX_PID=$!
wait "${NGINX_PID}"
cleanup
