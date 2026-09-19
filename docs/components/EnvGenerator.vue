<script setup lang="ts">
import { ref, computed, onMounted } from "vue";

// --- Preset Mode ---
const selectedPreset = ref<"simple" | "local" | "proxy" | "full">("simple");

// --- Feature Module Checkbox Toggles ---
const enableNetworkNginx = ref(false);
const enableCustomVolumes = ref(false);
const enableAuthAdmin = ref(false);
const enableRateLimiting = ref(false);
const enableOidc = ref(false);
const enableSmtp = ref(false);
const enableOutboundProxy = ref(false);
const enableGarmin = ref(false);

// --- 1. Database Credentials (Always Core) ---
const dbName = ref("sparkyfitness_db");
const dbUser = ref("sparky");
const dbPassword = ref("");
const appDbUser = ref("sparky_app");
const appDbPassword = ref("");
const dbHost = ref("sparkyfitness-db");
const dbPort = ref("5432");

// --- 2. Security Secrets & Access URL (Always Core) ---
const customFrontendUrl = ref("http://localhost:3004");
const apiEncryptionKey = ref("");
const betterAuthSecret = ref("");
const timezone = ref("Etc/UTC");
const logLevel = ref("ERROR");

// --- 3. Nginx & Reverse Proxy (Optional) ---
const frontendPort = ref("3004");
const serverPort = ref("3010");
const nginxRateLimit = ref("5r/s");
const nginxListenPort = ref("80");
const realIpHeader = ref<
  "none" | "CF-Connecting-IP" | "X-Forwarded-For" | "True-Client-IP"
>("none");
const trustedProxyHops = ref("1");
const allowPrivateNetworkCors = ref(false);
const extraTrustedOrigins = ref("");

// --- 4. Custom Host Storage Paths (Optional) ---
const dbPath = ref("../postgresql");
const backupPath = ref("./backup");
const uploadsPath = ref("./uploads");

// --- 5. Admin & Registration (Optional) ---
const adminEmail = ref("");
const disableSignup = ref(false);
const forceEmailLogin = ref(true);
const enableDemoMode = ref(false);
const demoEmail = ref("demo@sparkyfitness.com");
const demoPassword = ref("");

// --- 6. Rate Limiting (Optional) ---
const signinRateLimitMax = ref("4");
const signinRateLimitWindow = ref("60");
const apiKeyRateLimitMax = ref("100");
const apiKeyRateLimitWindowMs = ref("60000");

// --- 7. OIDC Single Sign-On (Optional) ---
const oidcProviderName = ref("Authentik");
const oidcProviderSlug = ref("authentik");
const oidcIssuerUrl = ref("");
const oidcClientId = ref("");
const oidcClientSecret = ref("");
const oidcAdminGroup = ref("Admin");
const oidcScope = ref("openid email profile");
const disableEmailLogin = ref(false);

// --- 8. Email / SMTP (Optional) ---
const smtpHost = ref("");
const smtpPort = ref("587");
const smtpSecure = ref(false);
const smtpUser = ref("");
const smtpPass = ref("");
const smtpFrom = ref("");

// --- 9. Outbound Forwarding Proxy (Optional) ---
const httpProxy = ref("");
const httpsProxy = ref("");
const noProxy = ref("localhost,127.0.0.1,sparkyfitness-garmin");

// --- 10. Garmin Microservice (Optional) ---
const garminUrl = ref("http://sparkyfitness-garmin:8000");
const garminPort = ref("8000");

// UI State
const copied = ref(false);
const showSecrets = ref(false);

// --- 100% Client-Side Web Crypto Generation ---
function generateHexKey(bytes = 32): string {
  if (
    typeof window === "undefined" ||
    !window.crypto ||
    !window.crypto.getRandomValues
  ) {
    let result = "";
    const hex = "0123456789abcdef";
    for (let i = 0; i < bytes * 2; i++) {
      result += hex[Math.floor(Math.random() * hex.length)];
    }
    return result;
  }
  const arr = new Uint8Array(bytes);
  window.crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSecurePassword(length = 24): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*_-";
  if (
    typeof window === "undefined" ||
    !window.crypto ||
    !window.crypto.getRandomValues
  ) {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
  const arr = new Uint32Array(length);
  window.crypto.getRandomValues(arr);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(arr[i] % chars.length);
  }
  return result;
}

function rerollSecrets() {
  dbPassword.value = generateSecurePassword(24);
  appDbPassword.value = generateSecurePassword(24);
  apiEncryptionKey.value = generateHexKey(32);
  betterAuthSecret.value = generateSecurePassword(32);
  demoPassword.value = generateSecurePassword(16);
}

function applyPreset(preset: "simple" | "local" | "proxy" | "full") {
  selectedPreset.value = preset;
  if (preset === "simple") {
    customFrontendUrl.value = "http://localhost:3004";
    enableNetworkNginx.value = false;
    enableCustomVolumes.value = false;
    enableAuthAdmin.value = false;
    enableRateLimiting.value = false;
    enableOidc.value = false;
    enableSmtp.value = false;
    enableOutboundProxy.value = false;
    enableGarmin.value = false;
    realIpHeader.value = "none";
  } else if (preset === "local") {
    customFrontendUrl.value = "http://localhost:3004";
    enableNetworkNginx.value = true;
    allowPrivateNetworkCors.value = true;
    enableCustomVolumes.value = false;
    enableAuthAdmin.value = false;
    enableRateLimiting.value = false;
    enableOidc.value = false;
    enableSmtp.value = false;
    enableOutboundProxy.value = false;
    enableGarmin.value = false;
    realIpHeader.value = "none";
  } else if (preset === "proxy") {
    customFrontendUrl.value = "https://fitness.example.com";
    enableNetworkNginx.value = true;
    realIpHeader.value = "CF-Connecting-IP";
    trustedProxyHops.value = "1";
    enableCustomVolumes.value = false;
    enableAuthAdmin.value = false;
    enableRateLimiting.value = false;
    enableOidc.value = false;
    enableSmtp.value = false;
    enableOutboundProxy.value = false;
    enableGarmin.value = false;
  } else if (preset === "full") {
    enableNetworkNginx.value = true;
    enableCustomVolumes.value = true;
    enableAuthAdmin.value = true;
    enableRateLimiting.value = true;
    enableOidc.value = true;
    enableSmtp.value = true;
    enableOutboundProxy.value = false;
    enableGarmin.value = true;
  }
}

function setQuickUrl(url: string) {
  customFrontendUrl.value = url;
}

// Reactive .env output
const generatedEnv = computed(() => {
  const isMinimal =
    !enableNetworkNginx.value &&
    !enableCustomVolumes.value &&
    !enableAuthAdmin.value &&
    !enableRateLimiting.value &&
    !enableOidc.value &&
    !enableSmtp.value &&
    !enableOutboundProxy.value &&
    !enableGarmin.value;

  if (isMinimal) {
    return `# =================================================================
# SparkyFitness - Simple 8-Variable Onboarding Configuration
# =================================================================
# Documentation: https://codewithcj.github.io/SparkyFitness/
# Note: The first registered user automatically receives full Admin access.

# Database Credentials
SPARKY_FITNESS_DB_NAME=${dbName.value}
SPARKY_FITNESS_DB_USER=${dbUser.value}
SPARKY_FITNESS_DB_PASSWORD=${dbPassword.value}
SPARKY_FITNESS_APP_DB_USER=${appDbUser.value}
SPARKY_FITNESS_APP_DB_PASSWORD=${appDbPassword.value}

# Security Secrets
SPARKY_FITNESS_API_ENCRYPTION_KEY=${apiEncryptionKey.value}
BETTER_AUTH_SECRET=${betterAuthSecret.value}

# Access URL
SPARKY_FITNESS_FRONTEND_URL=${customFrontendUrl.value}
`;
  }

  let out = `# =================================================================
# SparkyFitness - Environment Configuration
# Generated via SparkyFitness Interactive Generator
# =================================================================

# --- PostgreSQL Database Settings ---
SPARKY_FITNESS_DB_NAME=${dbName.value}
SPARKY_FITNESS_DB_USER=${dbUser.value}
SPARKY_FITNESS_DB_PASSWORD=${dbPassword.value}
SPARKY_FITNESS_APP_DB_USER=${appDbUser.value}
SPARKY_FITNESS_APP_DB_PASSWORD=${appDbPassword.value}
SPARKY_FITNESS_DB_HOST=${dbHost.value}
SPARKY_FITNESS_DB_PORT=${dbPort.value}

# --- Core Security & Server Settings ---
SPARKY_FITNESS_API_ENCRYPTION_KEY=${apiEncryptionKey.value}
BETTER_AUTH_SECRET=${betterAuthSecret.value}
SPARKY_FITNESS_FRONTEND_URL=${customFrontendUrl.value}
SPARKY_FITNESS_LOG_LEVEL=${logLevel.value}
NODE_ENV=production
TZ=${timezone.value}
`;

  if (enableNetworkNginx.value) {
    out += `\n# --- Frontend & Nginx Settings ---
SPARKY_FITNESS_FRONTEND_PORT=${frontendPort.value}
SPARKY_FITNESS_SERVER_PORT=${serverPort.value}
NGINX_RATE_LIMIT=${nginxRateLimit.value}
NGINX_LISTEN_PORT=${nginxListenPort.value}
`;
    if (realIpHeader.value !== "none") {
      out += `SPARKY_FITNESS_REAL_IP_HEADER=${realIpHeader.value}\n`;
    } else {
      out += `SPARKY_FITNESS_TRUSTED_PROXY_HOPS=${trustedProxyHops.value}\n`;
    }
    if (allowPrivateNetworkCors.value) {
      out += `ALLOW_PRIVATE_NETWORK_CORS=true\n`;
    }
    if (extraTrustedOrigins.value.trim()) {
      out += `SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS=${extraTrustedOrigins.value.trim()}\n`;
    }
  }

  if (enableCustomVolumes.value) {
    out += `\n# --- Volume Storage Paths ---
DB_PATH=${dbPath.value}
SERVER_BACKUP_PATH=${backupPath.value}
SERVER_UPLOADS_PATH=${uploadsPath.value}
`;
  }

  if (enableAuthAdmin.value) {
    out += `\n# --- Authentication & Admin Settings ---
SPARKY_FITNESS_FORCE_EMAIL_LOGIN=${forceEmailLogin.value}
`;
    if (disableSignup.value) {
      out += `SPARKY_FITNESS_DISABLE_SIGNUP=true\n`;
    }
    if (adminEmail.value.trim()) {
      out += `SPARKY_FITNESS_ADMIN_EMAIL=${adminEmail.value.trim()}\n`;
    }
    if (enableDemoMode.value) {
      out += `SPARKY_FITNESS_DEMO_MODE=true\nSPARKY_FITNESS_DEMO_EMAIL=${demoEmail.value}\nSPARKY_FITNESS_DEMO_PASSWORD=${demoPassword.value}\n`;
    }
  }

  if (enableRateLimiting.value) {
    out += `\n# --- Rate Limiting Settings ---
SPARKY_FITNESS_SIGN_IN_RATELIMIT_MAX=${signinRateLimitMax.value}
SPARKY_FITNESS_SIGN_IN_RATELIMIT_WINDOW=${signinRateLimitWindow.value}
SPARKY_FITNESS_API_KEY_RATELIMIT_MAX_REQUESTS=${apiKeyRateLimitMax.value}
SPARKY_FITNESS_API_KEY_RATELIMIT_WINDOW_MS=${apiKeyRateLimitWindowMs.value}
`;
  }

  if (enableOidc.value && oidcIssuerUrl.value.trim()) {
    out += `\n# --- OIDC Single Sign-On ---
SPARKY_FITNESS_OIDC_AUTH_ENABLED=true
SPARKY_FITNESS_OIDC_PROVIDER_NAME=${oidcProviderName.value}
SPARKY_FITNESS_OIDC_PROVIDER_SLUG=${oidcProviderSlug.value}
SPARKY_FITNESS_OIDC_ISSUER_URL=${oidcIssuerUrl.value}
SPARKY_FITNESS_OIDC_CLIENT_ID=${oidcClientId.value}
SPARKY_FITNESS_OIDC_CLIENT_SECRET=${oidcClientSecret.value}
SPARKY_FITNESS_OIDC_ADMIN_GROUP=${oidcAdminGroup.value}
SPARKY_FITNESS_OIDC_SCOPE=${oidcScope.value}
`;
    if (disableEmailLogin.value) {
      out += `SPARKY_FITNESS_DISABLE_EMAIL_LOGIN=true\n`;
    }
  }

  if (enableSmtp.value && smtpHost.value.trim()) {
    out += `\n# --- Email / SMTP Settings ---
SPARKY_FITNESS_EMAIL_HOST=${smtpHost.value}
SPARKY_FITNESS_EMAIL_PORT=${smtpPort.value}
SPARKY_FITNESS_EMAIL_SECURE=${smtpSecure.value}
SPARKY_FITNESS_EMAIL_USER=${smtpUser.value}
SPARKY_FITNESS_EMAIL_PASS=${smtpPass.value}
SPARKY_FITNESS_EMAIL_FROM=${smtpFrom.value}
`;
  }

  if (
    enableOutboundProxy.value &&
    (httpProxy.value.trim() || httpsProxy.value.trim())
  ) {
    out += `\n# --- Outbound Proxy Settings ---
`;
    if (httpProxy.value.trim()) out += `HTTP_PROXY=${httpProxy.value.trim()}\n`;
    if (httpsProxy.value.trim())
      out += `HTTPS_PROXY=${httpsProxy.value.trim()}\n`;
    if (noProxy.value.trim()) out += `NO_PROXY=${noProxy.value.trim()}\n`;
  }

  if (enableGarmin.value) {
    out += `\n# --- Garmin Microservice ---
GARMIN_MICROSERVICE_URL=${garminUrl.value}
GARMIN_SERVICE_PORT=${garminPort.value}
`;
  }

  return out;
});

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(generatedEnv.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2500);
  } catch {
    const el = document.createElement("textarea");
    el.value = generatedEnv.value;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2500);
  }
}

function downloadEnvFile() {
  const blob = new Blob([generatedEnv.value], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ".env";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

onMounted(() => {
  rerollSecrets();
});
</script>

<template>
  <div class="env-generator-container">
    <div class="security-badge">
      <span class="icon">🔒</span>
      <div>
        <strong>100% Client-Side Cryptography:</strong> All passwords and
        cryptographic secrets are generated in your browser memory using
        <code>window.crypto</code>. Zero network telemetry or data retention.
      </div>
    </div>

    <!-- Clean Preset Selection Bar -->
    <div class="preset-card">
      <span class="preset-title">Select Deployment Template:</span>
      <div class="preset-options">
        <label
          :class="[
            'preset-radio-option',
            { active: selectedPreset === 'simple' },
          ]"
        >
          <input
            type="radio"
            name="preset"
            value="simple"
            :checked="selectedPreset === 'simple'"
            @change="applyPreset('simple')"
          />
          <span class="preset-text">
            <strong>⚡ Minimal 8-Vars</strong>
            <small>Quickest 60-sec onboarding</small>
          </span>
        </label>
        <label
          :class="[
            'preset-radio-option',
            { active: selectedPreset === 'local' },
          ]"
        >
          <input
            type="radio"
            name="preset"
            value="local"
            :checked="selectedPreset === 'local'"
            @change="applyPreset('local')"
          />
          <span class="preset-text">
            <strong>💻 Localhost Dev</strong>
            <small>Local ports + private CORS</small>
          </span>
        </label>
        <label
          :class="[
            'preset-radio-option',
            { active: selectedPreset === 'proxy' },
          ]"
        >
          <input
            type="radio"
            name="preset"
            value="proxy"
            :checked="selectedPreset === 'proxy'"
            @change="applyPreset('proxy')"
          />
          <span class="preset-text">
            <strong>🌐 Reverse Proxy</strong>
            <small>HTTPS domain + real IP header</small>
          </span>
        </label>
        <label
          :class="[
            'preset-radio-option',
            { active: selectedPreset === 'full' },
          ]"
        >
          <input
            type="radio"
            name="preset"
            value="full"
            :checked="selectedPreset === 'full'"
            @change="applyPreset('full')"
          />
          <span class="preset-text">
            <strong>⚙️ All Features</strong>
            <small>SSO, SMTP, Volumes, Garmin</small>
          </span>
        </label>
      </div>
    </div>

    <!-- CORE ESSENTIALS CARD (Always Active) -->
    <div class="config-card">
      <div class="card-toolbar">
        <div>
          <h3 style="margin: 0">🔑 Core Essentials</h3>
          <span class="sub-hint"
            >Required for all Docker Compose and bare-metal setups</span
          >
        </div>
        <div class="toolbar-actions">
          <button
            type="button"
            class="action-btn secondary"
            @click="showSecrets = !showSecrets"
          >
            {{ showSecrets ? "🙈 Hide Secrets" : "👁️ Show Secrets" }}
          </button>
          <button
            type="button"
            class="action-btn secondary"
            @click="rerollSecrets"
          >
            🎲 Re-roll Secrets
          </button>
        </div>
      </div>

      <!-- Application URL -->
      <div class="form-group" style="margin-bottom: 20px">
        <label>
          Application Access URL
          <code class="var-badge">SPARKY_FITNESS_FRONTEND_URL</code>
        </label>
        <input
          v-model="customFrontendUrl"
          type="text"
          class="text-input font-mono"
          placeholder="http://localhost:3004 or https://fitness.yourdomain.com"
        />
        <div class="quick-links">
          <span>Quick fill:</span>
          <button
            type="button"
            class="quick-tag"
            @click="setQuickUrl('http://localhost:3004')"
          >
            Localhost (3004)
          </button>
          <button
            type="button"
            class="quick-tag"
            @click="setQuickUrl('http://192.168.1.100:3004')"
          >
            LAN IP (192.168.1.100)
          </button>
          <button
            type="button"
            class="quick-tag"
            @click="setQuickUrl('https://fitness.example.com')"
          >
            HTTPS Domain
          </button>
        </div>
        <span class="field-hint"
          >The public address you open in your browser or mobile app. Essential
          for CORS security and cookie sessions.</span
        >
      </div>

      <!-- Database Credentials Grid -->
      <div class="section-title">PostgreSQL Database Credentials</div>
      <div class="field-explanation">
        SparkyFitness uses a superuser for migrations and a restricted
        least-privilege user for daily application requests.
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label
            >Database Name
            <code class="var-badge">SPARKY_FITNESS_DB_NAME</code></label
          >
          <input
            v-model="dbName"
            type="text"
            class="text-input"
            placeholder="sparkyfitness_db"
          />
          <span class="field-hint"
            >PostgreSQL database name created inside the container.</span
          >
        </div>
        <div class="form-group">
          <label
            >Superuser User
            <code class="var-badge">SPARKY_FITNESS_DB_USER</code></label
          >
          <input
            v-model="dbUser"
            type="text"
            class="text-input"
            placeholder="sparky"
          />
          <span class="field-hint"
            >Admin database user for migrations and RLS policies.</span
          >
        </div>
        <div class="form-group">
          <label
            >Superuser Password
            <code class="var-badge">SPARKY_FITNESS_DB_PASSWORD</code></label
          >
          <div class="input-with-action">
            <input
              v-model="dbPassword"
              :type="showSecrets ? 'text' : 'password'"
              class="text-input font-mono"
            />
            <button
              type="button"
              class="icon-btn"
              title="Generate New Password"
              @click="dbPassword = generateSecurePassword(24)"
            >
              🎲
            </button>
          </div>
          <span class="field-hint">Database superuser password.</span>
        </div>
        <div class="form-group">
          <label
            >App Database User
            <code class="var-badge">SPARKY_FITNESS_APP_DB_USER</code></label
          >
          <input
            v-model="appDbUser"
            type="text"
            class="text-input"
            placeholder="sparky_app"
          />
          <span class="field-hint">Restricted runtime application user.</span>
        </div>
        <div class="form-group">
          <label
            >App Database Password
            <code class="var-badge">SPARKY_FITNESS_APP_DB_PASSWORD</code></label
          >
          <div class="input-with-action">
            <input
              v-model="appDbPassword"
              :type="showSecrets ? 'text' : 'password'"
              class="text-input font-mono"
            />
            <button
              type="button"
              class="icon-btn"
              title="Generate New Password"
              @click="appDbPassword = generateSecurePassword(24)"
            >
              🎲
            </button>
          </div>
          <span class="field-hint">Runtime database access password.</span>
        </div>
        <div class="form-group">
          <label
            >Database Host
            <code class="var-badge">SPARKY_FITNESS_DB_HOST</code></label
          >
          <input
            v-model="dbHost"
            type="text"
            class="text-input"
            placeholder="sparkyfitness-db"
          />
          <span class="field-hint"
            >Internal Docker network service name. Default:
            <code>sparkyfitness-db</code>.</span
          >
        </div>
      </div>

      <!-- Security Encryption Keys -->
      <div class="section-title" style="margin-top: 20px">
        Security & Encryption Keys
      </div>
      <div class="field-explanation">
        Cryptographic secrets used to protect stored data and authenticate
        active sessions.
      </div>
      <div class="form-group">
        <label
          >API Encryption Key
          <code class="var-badge"
            >SPARKY_FITNESS_API_ENCRYPTION_KEY</code
          ></label
        >
        <div class="input-with-action">
          <input
            v-model="apiEncryptionKey"
            :type="showSecrets ? 'text' : 'password'"
            class="text-input font-mono"
          />
          <button
            type="button"
            class="icon-btn"
            title="Generate New 64-char Hex Key"
            @click="apiEncryptionKey = generateHexKey(32)"
          >
            🎲
          </button>
        </div>
        <span class="field-hint"
          >64-character Hex string (256-bit AES). Encrypts external API keys and
          tokens in Postgres.</span
        >
      </div>

      <div class="form-group" style="margin-top: 10px">
        <label
          >Better Auth Secret
          <code class="var-badge">BETTER_AUTH_SECRET</code></label
        >
        <div class="input-with-action">
          <input
            v-model="betterAuthSecret"
            :type="showSecrets ? 'text' : 'password'"
            class="text-input font-mono"
          />
          <button
            type="button"
            class="icon-btn"
            title="Generate New Auth Secret"
            @click="betterAuthSecret = generateSecurePassword(32)"
          >
            🎲
          </button>
        </div>
        <span class="field-hint"
          >Signs session JWTs and encrypts TOTP 2-Factor Authentication keys.
          Keep persistent.</span
        >
      </div>
    </div>

    <!-- OPTIONAL FEATURE MODULES (CHECKBOX CARDS) -->
    <div class="module-cards">
      <div class="optional-modules-title">
        <span>Optional Configuration Modules</span>
        <small>Select what you need for your deployment environment</small>
      </div>

      <!-- Module 1: Nginx & Reverse Proxy -->
      <div :class="['module-card', { active: enableNetworkNginx }]">
        <div
          class="module-header"
          @click="enableNetworkNginx = !enableNetworkNginx"
        >
          <label class="module-toggle" @click.stop>
            <input v-model="enableNetworkNginx" type="checkbox" />
            <span class="module-title"
              >🌐 Nginx, Ports & Reverse Proxy Headers</span
            >
          </label>
          <span class="module-badge">{{
            enableNetworkNginx ? "Enabled" : "Click to Enable"
          }}</span>
        </div>
        <div v-if="enableNetworkNginx" class="module-body">
          <div class="field-explanation">
            Configure host port mappings, Nginx brute-force protection, and real
            client IP header resolution.
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label
                >Frontend Host Port
                <code class="var-badge"
                  >SPARKY_FITNESS_FRONTEND_PORT</code
                ></label
              >
              <input
                v-model="frontendPort"
                type="text"
                class="text-input"
                placeholder="3004"
              />
              <span class="field-hint"
                >Port exposed on your host machine for web access. Default:
                <code>3004</code>.</span
              >
            </div>
            <div class="form-group">
              <label
                >Nginx Auth Rate Limit
                <code class="var-badge">NGINX_RATE_LIMIT</code></label
              >
              <input
                v-model="nginxRateLimit"
                type="text"
                class="text-input"
                placeholder="5r/s"
              />
              <span class="field-hint"
                >Rate limit on <code>/api/auth/*</code> routes to prevent
                brute-force attacks. Default: <code>5r/s</code>.</span
              >
            </div>
            <div class="form-group">
              <label
                >Client Real IP Header
                <code class="var-badge"
                  >SPARKY_FITNESS_REAL_IP_HEADER</code
                ></label
              >
              <select v-model="realIpHeader" class="text-input">
                <option value="none">None (Direct or LAN Access)</option>
                <option value="CF-Connecting-IP">
                  Cloudflare Tunnel / CDN (CF-Connecting-IP)
                </option>
                <option value="X-Forwarded-For">
                  Traefik / Caddy / Nginx Proxy Manager (X-Forwarded-For)
                </option>
                <option value="True-Client-IP">
                  Enterprise Proxy (True-Client-IP)
                </option>
              </select>
              <span class="field-hint"
                >Accurately identifies visitor IP address behind proxies for
                rate limiting and audit logs.</span
              >
            </div>
            <div class="form-group" v-if="realIpHeader === 'none'">
              <label
                >Trusted Proxy Hops
                <code class="var-badge"
                  >SPARKY_FITNESS_TRUSTED_PROXY_HOPS</code
                ></label
              >
              <input
                v-model="trustedProxyHops"
                type="text"
                class="text-input"
                placeholder="1"
              />
              <span class="field-hint"
                >Number of proxy layers between client and server. Default:
                <code>1</code>.</span
              >
            </div>
          </div>
          <div class="checkbox-group" style="margin-top: 12px">
            <label class="checkbox-label">
              <input v-model="allowPrivateNetworkCors" type="checkbox" />
              <span class="checkbox-text">
                Allow Private Network CORS
                <code class="var-badge">ALLOW_PRIVATE_NETWORK_CORS=true</code>
              </span>
            </label>
            <span class="field-hint" style="margin-left: 26px"
              >Enables browser API calls from private LAN subnets (192.168.x.x,
              10.x.x.x, 172.16.x.x).</span
            >
          </div>
        </div>
      </div>

      <!-- Module 2: Storage & Volume Paths -->
      <div :class="['module-card', { active: enableCustomVolumes }]">
        <div
          class="module-header"
          @click="enableCustomVolumes = !enableCustomVolumes"
        >
          <label class="module-toggle" @click.stop>
            <input v-model="enableCustomVolumes" type="checkbox" />
            <span class="module-title">💾 Persistent Host Storage Paths</span>
          </label>
          <span class="module-badge">{{
            enableCustomVolumes ? "Enabled" : "Click to Enable"
          }}</span>
        </div>
        <div v-if="enableCustomVolumes" class="module-body">
          <div class="field-explanation">
            Map database, backups, and user uploads to specific paths on your
            host filesystem (e.g. Synology NAS, Unraid, TrueNAS).
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label
                >Postgres Data Path
                <code class="var-badge">DB_PATH</code></label
              >
              <input
                v-model="dbPath"
                type="text"
                class="text-input"
                placeholder="../postgresql"
              />
              <span class="field-hint"
                >Host directory for PostgreSQL cluster data.</span
              >
            </div>
            <div class="form-group">
              <label
                >Backups Path
                <code class="var-badge">SERVER_BACKUP_PATH</code></label
              >
              <input
                v-model="backupPath"
                type="text"
                class="text-input"
                placeholder="./backup"
              />
              <span class="field-hint"
                >Host directory where database backups are exported.</span
              >
            </div>
            <div class="form-group">
              <label
                >Uploads & Images Path
                <code class="var-badge">SERVER_UPLOADS_PATH</code></label
              >
              <input
                v-model="uploadsPath"
                type="text"
                class="text-input"
                placeholder="./uploads"
              />
              <span class="field-hint"
                >Host directory for user profile avatars and custom food
                photos.</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Module 3: Admin & Registration Controls -->
      <div :class="['module-card', { active: enableAuthAdmin }]">
        <div class="module-header" @click="enableAuthAdmin = !enableAuthAdmin">
          <label class="module-toggle" @click.stop>
            <input v-model="enableAuthAdmin" type="checkbox" />
            <span class="module-title"
              >🛡️ Admin Email, Public Signups & Public Demo Mode</span
            >
          </label>
          <span class="module-badge">{{
            enableAuthAdmin ? "Enabled" : "Click to Enable"
          }}</span>
        </div>
        <div v-if="enableAuthAdmin" class="module-body">
          <div class="field-explanation">
            Control initial administrator access, lock public signups for
            private instances, or enable public demo mode.
          </div>

          <!-- Specific Admin Email -->
          <div class="form-group">
            <label>Specific Admin Email (Optional)</label>
            <input
              v-model="adminEmail"
              type="email"
              class="text-input"
              placeholder="admin@example.com"
            />
            <span class="field-hint"
              >If left blank, the <strong>first user to register</strong> is
              automatically granted Admin privileges.</span
            >
          </div>

          <!-- Disable Public Signups -->
          <div
            class="checkbox-group"
            style="
              margin-top: 14px;
              padding-top: 14px;
              border-top: 1px dashed rgba(125, 125, 125, 0.2);
            "
          >
            <label class="checkbox-label">
              <input v-model="disableSignup" type="checkbox" />
              <span class="checkbox-text">
                Disable Public Signups
                <code class="var-badge"
                  >SPARKY_FITNESS_DISABLE_SIGNUP=true</code
                >
              </span>
            </label>
            <span class="field-hint" style="margin-left: 26px"
              >Enable after creating your accounts to lock registration for
              strangers.</span
            >
          </div>

          <!-- Public Demo Mode -->
          <div
            class="checkbox-group"
            style="
              margin-top: 14px;
              padding-top: 14px;
              border-top: 1px dashed rgba(125, 125, 125, 0.2);
            "
          >
            <label class="checkbox-label">
              <input v-model="enableDemoMode" type="checkbox" />
              <span class="checkbox-text">
                Enable Public Demo Mode
                <code class="var-badge">SPARKY_FITNESS_DEMO_MODE=true</code>
              </span>
            </label>
            <span class="field-hint" style="margin-left: 26px"
              >Runs a demo account seeded with sample data that resets daily at
              midnight UTC.</span
            >
          </div>

          <div
            v-if="enableDemoMode"
            class="grid-2"
            style="margin-top: 10px; margin-left: 26px"
          >
            <div class="form-group">
              <label>Demo Email</label>
              <input
                v-model="demoEmail"
                type="email"
                class="text-input"
                placeholder="demo@sparkyfitness.com"
              />
            </div>
            <div class="form-group">
              <label>Demo Password</label>
              <input
                v-model="demoPassword"
                :type="showSecrets ? 'text' : 'password'"
                class="text-input font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Module 4: Rate Limiting -->
      <div :class="['module-card', { active: enableRateLimiting }]">
        <div
          class="module-header"
          @click="enableRateLimiting = !enableRateLimiting"
        >
          <label class="module-toggle" @click.stop>
            <input v-model="enableRateLimiting" type="checkbox" />
            <span class="module-title">⏱️ Sign-in & API Key Rate Limiting</span>
          </label>
          <span class="module-badge">{{
            enableRateLimiting ? "Enabled" : "Click to Enable"
          }}</span>
        </div>
        <div v-if="enableRateLimiting" class="module-body">
          <div class="field-explanation">
            Customize rate-limiting thresholds for logins, two-factor
            verification, and external automation API keys.
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label
                >Max Sign-in Attempts
                <code class="var-badge"
                  >SPARKY_FITNESS_SIGN_IN_RATELIMIT_MAX</code
                ></label
              >
              <input
                v-model="signinRateLimitMax"
                type="text"
                class="text-input"
                placeholder="4"
              />
              <span class="field-hint"
                >Attempts allowed per IP before temporary lockout. Default:
                <code>4</code>.</span
              >
            </div>
            <div class="form-group">
              <label
                >Sign-in Window Seconds
                <code class="var-badge"
                  >SPARKY_FITNESS_SIGN_IN_RATELIMIT_WINDOW</code
                ></label
              >
              <input
                v-model="signinRateLimitWindow"
                type="text"
                class="text-input"
                placeholder="60"
              />
              <span class="field-hint"
                >Lockout tracking window in seconds. Default:
                <code>60</code>.</span
              >
            </div>
            <div class="form-group">
              <label
                >Max API Key Requests
                <code class="var-badge"
                  >SPARKY_FITNESS_API_KEY_RATELIMIT_MAX_REQUESTS</code
                ></label
              >
              <input
                v-model="apiKeyRateLimitMax"
                type="text"
                class="text-input"
                placeholder="100"
              />
              <span class="field-hint"
                >Max requests per API key token window. Default:
                <code>100</code>.</span
              >
            </div>
            <div class="form-group">
              <label
                >API Key Window MS
                <code class="var-badge"
                  >SPARKY_FITNESS_API_KEY_RATELIMIT_WINDOW_MS</code
                ></label
              >
              <input
                v-model="apiKeyRateLimitWindowMs"
                type="text"
                class="text-input"
                placeholder="60000"
              />
              <span class="field-hint"
                >Window in milliseconds. Default: <code>60000</code>.</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Module 5: OIDC Single Sign-On -->
      <div :class="['module-card', { active: enableOidc }]">
        <div class="module-header" @click="enableOidc = !enableOidc">
          <label class="module-toggle" @click.stop>
            <input v-model="enableOidc" type="checkbox" />
            <span class="module-title">🔑 OpenID Connect (OIDC / SSO)</span>
          </label>
          <span class="module-badge">{{
            enableOidc ? "Enabled" : "Click to Enable"
          }}</span>
        </div>
        <div v-if="enableOidc" class="module-body">
          <div class="field-explanation">
            Integrate with Authentik, Keycloak, Authelia, or Okta for
            centralized enterprise login and role claims.
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label
                >Provider Name
                <code class="var-badge"
                  >SPARKY_FITNESS_OIDC_PROVIDER_NAME</code
                ></label
              >
              <input
                v-model="oidcProviderName"
                type="text"
                class="text-input"
                placeholder="Authentik / Keycloak / Authelia"
              />
              <span class="field-hint"
                >Label displayed on the "Log in with..." button.</span
              >
            </div>
            <div class="form-group">
              <label
                >Provider Slug
                <code class="var-badge"
                  >SPARKY_FITNESS_OIDC_PROVIDER_SLUG</code
                ></label
              >
              <input
                v-model="oidcProviderSlug"
                type="text"
                class="text-input"
                placeholder="authentik"
              />
              <span class="field-hint"
                >URL-safe unique identifier for the provider.</span
              >
            </div>
            <div class="form-group">
              <label
                >OIDC Issuer URL
                <code class="var-badge"
                  >SPARKY_FITNESS_OIDC_ISSUER_URL</code
                ></label
              >
              <input
                v-model="oidcIssuerUrl"
                type="text"
                class="text-input font-mono"
                placeholder="https://auth.example.com/application/o/sparky/"
              />
              <span class="field-hint"
                >Base URL of your IdP. Discovery metadata is derived from
                <code>/.well-known/openid-configuration</code>.</span
              >
            </div>
            <div class="form-group">
              <label
                >Client ID
                <code class="var-badge"
                  >SPARKY_FITNESS_OIDC_CLIENT_ID</code
                ></label
              >
              <input
                v-model="oidcClientId"
                type="text"
                class="text-input"
                placeholder="sparky-client-id"
              />
              <span class="field-hint"
                >OAuth2 Client ID created in your IdP.</span
              >
            </div>
            <div class="form-group">
              <label
                >Client Secret
                <code class="var-badge"
                  >SPARKY_FITNESS_OIDC_CLIENT_SECRET</code
                ></label
              >
              <input
                v-model="oidcClientSecret"
                :type="showSecrets ? 'text' : 'password'"
                class="text-input font-mono"
              />
              <span class="field-hint"
                >OAuth2 Client Secret created in your IdP.</span
              >
            </div>
            <div class="form-group">
              <label
                >Admin Group Claim
                <code class="var-badge"
                  >SPARKY_FITNESS_OIDC_ADMIN_GROUP</code
                ></label
              >
              <input
                v-model="oidcAdminGroup"
                type="text"
                class="text-input"
                placeholder="Admin"
              />
              <span class="field-hint"
                >Group or role claim that automatically elevates the user to
                Admin.</span
              >
            </div>
          </div>
          <div class="checkbox-group" style="margin-top: 12px">
            <label class="checkbox-label">
              <input v-model="disableEmailLogin" type="checkbox" />
              <span class="checkbox-text">
                Disable Email/Password Login on UI
                <code class="var-badge"
                  >SPARKY_FITNESS_DISABLE_EMAIL_LOGIN=true</code
                >
              </span>
            </label>
            <span class="field-hint" style="margin-left: 26px"
              >Forces users to log in exclusively via SSO.</span
            >
          </div>
        </div>
      </div>

      <!-- Module 6: SMTP Mail Server -->
      <div :class="['module-card', { active: enableSmtp }]">
        <div class="module-header" @click="enableSmtp = !enableSmtp">
          <label class="module-toggle" @click.stop>
            <input v-model="enableSmtp" type="checkbox" />
            <span class="module-title">✉️ SMTP Email Notifications</span>
          </label>
          <span class="module-badge">{{
            enableSmtp ? "Enabled" : "Click to Enable"
          }}</span>
        </div>
        <div v-if="enableSmtp" class="module-body">
          <div class="field-explanation">
            Enable sending password reset emails, account verification codes,
            and system alerts.
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label
                >SMTP Host
                <code class="var-badge">SPARKY_FITNESS_EMAIL_HOST</code></label
              >
              <input
                v-model="smtpHost"
                type="text"
                class="text-input"
                placeholder="smtp.mailgun.org"
              />
              <span class="field-hint">Outgoing mail server hostname.</span>
            </div>
            <div class="form-group">
              <label
                >SMTP Port
                <code class="var-badge">SPARKY_FITNESS_EMAIL_PORT</code></label
              >
              <input
                v-model="smtpPort"
                type="text"
                class="text-input"
                placeholder="587"
              />
              <span class="field-hint"
                >587 for STARTTLS, 465 for SSL/TLS, or 25 for local
                relays.</span
              >
            </div>
            <div class="form-group">
              <label
                >SMTP Username
                <code class="var-badge">SPARKY_FITNESS_EMAIL_USER</code></label
              >
              <input
                v-model="smtpUser"
                type="text"
                class="text-input"
                placeholder="postmaster@yourdomain.com"
              />
              <span class="field-hint">Authentication username.</span>
            </div>
            <div class="form-group">
              <label
                >SMTP Password
                <code class="var-badge">SPARKY_FITNESS_EMAIL_PASS</code></label
              >
              <input
                v-model="smtpPass"
                :type="showSecrets ? 'text' : 'password'"
                class="text-input font-mono"
              />
              <span class="field-hint"
                >Authentication password or API token.</span
              >
            </div>
            <div class="form-group">
              <label
                >From Email
                <code class="var-badge">SPARKY_FITNESS_EMAIL_FROM</code></label
              >
              <input
                v-model="smtpFrom"
                type="email"
                class="text-input"
                placeholder="noreply@yourdomain.com"
              />
              <span class="field-hint"
                >Sender address visible to recipients.</span
              >
            </div>
          </div>

          <div class="checkbox-group" style="margin-top: 14px">
            <label class="checkbox-label">
              <input v-model="smtpSecure" type="checkbox" />
              <span class="checkbox-text">
                Use SSL/TLS (Port 465)
                <code class="var-badge">SPARKY_FITNESS_EMAIL_SECURE=true</code>
              </span>
            </label>
            <span class="field-hint" style="margin-left: 26px"
              >Enable for port 465 implicit TLS. Leave unchecked for port 587
              STARTTLS.</span
            >
          </div>
        </div>
      </div>

      <!-- Module 7: Outbound Proxy -->
      <div :class="['module-card', { active: enableOutboundProxy }]">
        <div
          class="module-header"
          @click="enableOutboundProxy = !enableOutboundProxy"
        >
          <label class="module-toggle" @click.stop>
            <input v-model="enableOutboundProxy" type="checkbox" />
            <span class="module-title"
              >🛡️ Outbound Corporate / Forwarding Proxy</span
            >
          </label>
          <span class="module-badge">{{
            enableOutboundProxy ? "Enabled" : "Click to Enable"
          }}</span>
        </div>
        <div v-if="enableOutboundProxy" class="module-body">
          <div class="field-explanation">
            Route the backend server's outgoing requests (such as OpenFoodFacts
            or Strava sync) through a corporate forward proxy.
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label
                >HTTP Proxy <code class="var-badge">HTTP_PROXY</code></label
              >
              <input
                v-model="httpProxy"
                type="text"
                class="text-input font-mono"
                placeholder="http://proxy.example.com:8888"
              />
            </div>
            <div class="form-group">
              <label
                >HTTPS Proxy <code class="var-badge">HTTPS_PROXY</code></label
              >
              <input
                v-model="httpsProxy"
                type="text"
                class="text-input font-mono"
                placeholder="http://proxy.example.com:8888"
              />
            </div>
            <div class="form-group" style="grid-column: 1 / -1">
              <label
                >No Proxy Exclusions
                <code class="var-badge">NO_PROXY</code></label
              >
              <input
                v-model="noProxy"
                type="text"
                class="text-input font-mono"
                placeholder="localhost,127.0.0.1,sparkyfitness-garmin"
              />
              <span class="field-hint"
                >Comma-separated internal hostnames that bypass the proxy.</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Module 8: Garmin Microservice -->
      <div :class="['module-card', { active: enableGarmin }]">
        <div class="module-header" @click="enableGarmin = !enableGarmin">
          <label class="module-toggle" @click.stop>
            <input v-model="enableGarmin" type="checkbox" />
            <span class="module-title">⌚ Garmin Connect Microservice</span>
          </label>
          <span class="module-badge">{{
            enableGarmin ? "Enabled" : "Click to Enable"
          }}</span>
        </div>
        <div v-if="enableGarmin" class="module-body">
          <div class="field-explanation">
            Connects to the Python-based Garmin sync microservice bundled in
            <code>docker-compose.prod.yml</code>.
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label
                >Microservice URL
                <code class="var-badge">GARMIN_MICROSERVICE_URL</code></label
              >
              <input
                v-model="garminUrl"
                type="text"
                class="text-input font-mono"
                placeholder="http://sparkyfitness-garmin:8000"
              />
              <span class="field-hint"
                >Internal Docker network service endpoint. Default:
                <code>http://sparkyfitness-garmin:8000</code>.</span
              >
            </div>
            <div class="form-group">
              <label
                >Service Port
                <code class="var-badge">GARMIN_SERVICE_PORT</code></label
              >
              <input
                v-model="garminPort"
                type="text"
                class="text-input"
                placeholder="8000"
              />
              <span class="field-hint"
                >Internal port the Garmin microservice listens on. Default:
                <code>8000</code>.</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- OUTPUT .ENV PREVIEW CARD -->
    <div class="output-card">
      <div class="card-toolbar">
        <div>
          <h3 style="margin: 0">Generated <code>.env</code> Output</h3>
          <span class="sub-hint"
            >Save this as <code>.env</code> in the same directory as your
            <code>docker-compose.yml</code></span
          >
        </div>
        <div class="toolbar-actions">
          <button
            type="button"
            class="action-btn primary"
            @click="copyToClipboard"
          >
            {{ copied ? "✅ Copied to Clipboard!" : "📋 Copy .env" }}
          </button>
          <button
            type="button"
            class="action-btn secondary"
            @click="downloadEnvFile"
          >
            ⬇️ Download .env File
          </button>
        </div>
      </div>
      <pre class="env-preview"><code>{{ generatedEnv }}</code></pre>
    </div>
  </div>
</template>

<style scoped>
.env-generator-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 24px 0;
  font-family: inherit;
}

.security-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 0.92rem;
}

.security-badge .icon {
  font-size: 1.4rem;
}

/* Preset Radio Options Card */
.preset-card {
  background: rgba(125, 125, 125, 0.05);
  border: 1px solid rgba(125, 125, 125, 0.2);
  border-radius: 10px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preset-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--vp-c-brand-1, #3b82f6);
}

.preset-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.preset-radio-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(125, 125, 125, 0.05);
  border: 1px solid rgba(125, 125, 125, 0.25);
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-radio-option input[type="radio"] {
  margin-top: 3px;
  accent-color: var(--vp-c-brand-1, #3b82f6);
}

.preset-radio-option.active {
  border-color: var(--vp-c-brand-1, #3b82f6);
  background: var(--vp-c-brand-soft, rgba(59, 130, 246, 0.12));
}

.preset-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preset-text strong {
  font-size: 0.92rem;
}

.preset-text small {
  font-size: 0.78rem;
  color: var(--vp-c-text-2, #888);
}

/* Main Form Card */
.config-card,
.output-card {
  background: rgba(125, 125, 125, 0.05);
  border: 1px solid rgba(125, 125, 125, 0.2);
  border-radius: 10px;
  padding: 20px;
}

.card-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 10px;
}

.sub-hint {
  font-size: 0.82rem;
  color: var(--vp-c-text-2, #888);
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.action-btn.primary {
  background: var(--vp-c-brand-1, #3b82f6);
  color: #fff;
}
.action-btn.primary:hover {
  background: var(--vp-c-brand-2, #2563eb);
}

.action-btn.secondary {
  background: rgba(125, 125, 125, 0.15);
  color: inherit;
  border-color: rgba(125, 125, 125, 0.3);
}
.action-btn.secondary:hover {
  background: rgba(125, 125, 125, 0.25);
}

.section-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--vp-c-brand-1, #3b82f6);
  margin-bottom: 4px;
}

.field-explanation {
  font-size: 0.84rem;
  color: var(--vp-c-text-2, #888);
  margin-bottom: 12px;
  line-height: 1.4;
}

.quick-links {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-size: 0.82rem;
  color: var(--vp-c-text-2, #888);
}

.quick-tag {
  background: rgba(125, 125, 125, 0.12);
  border: 1px solid rgba(125, 125, 125, 0.25);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.8rem;
  cursor: pointer;
  color: inherit;
  transition: all 0.15s ease;
}

.quick-tag:hover {
  border-color: var(--vp-c-brand-1, #3b82f6);
  color: var(--vp-c-brand-1, #3b82f6);
}

.optional-modules-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
}

.optional-modules-title span {
  font-weight: 700;
  font-size: 1.05rem;
}

.optional-modules-title small {
  font-size: 0.84rem;
  color: var(--vp-c-text-2, #888);
}

.module-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.module-card {
  background: rgba(125, 125, 125, 0.04);
  border: 1px solid rgba(125, 125, 125, 0.2);
  border-radius: 8px;
  transition: all 0.2s ease;
  overflow: hidden;
}

.module-card.active {
  border-color: var(--vp-c-brand-1, #3b82f6);
  background: rgba(59, 130, 246, 0.03);
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  cursor: pointer;
  user-select: none;
}

.module-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.98rem;
  font-weight: 600;
  cursor: pointer;
}

.module-toggle input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--vp-c-brand-1, #3b82f6);
}

.module-badge {
  font-size: 0.8rem;
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(125, 125, 125, 0.15);
  color: var(--vp-c-text-2, #888);
}

.module-card.active .module-badge {
  background: var(--vp-c-brand-soft, rgba(59, 130, 246, 0.15));
  color: var(--vp-c-brand-1, #3b82f6);
  font-weight: 600;
}

.module-body {
  padding: 16px 18px 20px 18px;
  border-top: 1px solid rgba(125, 125, 125, 0.15);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* Grid items default to min-width:auto, so a long var-badge would push the
     column wider than its track and overlap the neighbouring field. */
  min-width: 0;
}

.form-group label {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 6px;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.4;
}

.text-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(125, 125, 125, 0.3);
  background: rgba(0, 0, 0, 0.05);
  color: inherit;
  font-size: 0.92rem;
  box-sizing: border-box;
}

.dark .text-input {
  background: rgba(255, 255, 255, 0.05);
}

.text-input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1, #3b82f6);
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.input-with-action {
  display: flex;
  gap: 6px;
}

.icon-btn {
  background: rgba(125, 125, 125, 0.15);
  border: 1px solid rgba(125, 125, 125, 0.3);
  border-radius: 6px;
  padding: 0 12px;
  cursor: pointer;
  font-size: 1.1rem;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  background: var(--vp-c-brand-soft, rgba(59, 130, 246, 0.2));
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.checkbox-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  margin-top: 3px;
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--vp-c-brand-1, #3b82f6);
  flex-shrink: 0;
}

.checkbox-text {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  line-height: 1.4;
}

.var-badge {
  font-size: 0.72rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--vp-c-brand-soft, rgba(59, 130, 246, 0.12));
  color: var(--vp-c-brand-1, #3b82f6);
  font-family: var(--vp-font-family-mono, monospace);
  font-weight: 500;
  /* Names like SPARKY_FITNESS_API_KEY_RATELIMIT_MAX_REQUESTS have no natural
     break opportunity; without this they overflow the field. */
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.field-hint {
  font-size: 0.78rem;
  color: var(--vp-c-text-2, #888);
  line-height: 1.35;
  margin-top: 2px;
}

.env-preview {
  margin: 0;
  padding: 16px;
  background: #111827;
  color: #f3f4f6;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.88rem;
  line-height: 1.5;
  max-height: 500px;
}

.env-preview code {
  color: #e5e7eb;
}
</style>
