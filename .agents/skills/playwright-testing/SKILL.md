---
name: playwright-testing
description: Use whenever testing the web app (frontend) end-to-end, unattended in the background, or capturing web screenshots using Playwright and headless Chrome. Covers headless execution without remote debugging, PII/secret redaction before taking screenshots, Vite-safe API interception, session mocking, DOM interactions, and process cleanup.
---

# Web E2E Testing with Playwright

Canonical copy. `.claude/skills/playwright-testing/SKILL.md` is a stub pointing here.

How to run unattended, automated end-to-end tests and screenshot verification against the SparkyFitness web frontend (`SparkyFitnessFrontend/`) using Playwright and headless Google Chrome.

---

## 1. Ground Rules & Privacy / PII Protection

### 🔒 Strict Zero-PII, Secrets & Network Privacy Policy (Mandatory)

Every screenshot and log output is saved into artifacts or transcripts and may be visible to users or reviewers. You **MUST NEVER** expose:

- **Mandatory Synthetic Data**: Always test with synthetic accounts (e.g., `user@example.com`, `testuser@local`) and synthetic fixtures. Do not rely solely on DOM selectors or post-hoc blurring to remove sensitive data, as unmarked email inputs, avatar images, and private notes can easily slip through. Ensure real personal data is never loaded into the session in the first place, or explicitly identify and verify that all sensitive elements are redacted before capture.
- **Secrets, Credentials & Passwords**: Never log, echo, or screenshot passwords, bearer tokens, API keys, database credentials, or session cookies in terminal output, heredocs, test files, or captured screens.
- **Network Identifiers & Private Infrastructure**: Mask or omit private server IP addresses (e.g. `141.x.x.x`), internal hostnames, and custom production/staging domain names. Use `localhost` or standard placeholders (`sparkyfitness.example.com`).
- **Defense-in-depth DOM redaction**: In addition to using synthetic accounts, verify and redact all sensitive elements (including unmarked email inputs, avatars, notes, and usernames) before taking screenshots:
  ```js
  await page.evaluate(() => {
    // Mask sensitive text: email displays, username badges, auth headers, token values, server URLs
    document
      .querySelectorAll(
        '[data-testid="user-email"], .user-email, input[type="password"], [data-pii], input[type="email"]',
      )
      .forEach((el) => {
        if (el.tagName === "INPUT") el.value = "••••••••";
        else el.textContent = "user@example.com";
      });
    // Mask avatar images and private notes
    document
      .querySelectorAll("img.avatar, .avatar-image, [data-note-content]")
      .forEach((el) => {
        if (el.tagName === "IMG")
          el.src =
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
        else el.textContent = "[REDACTED]";
      });
    // Redact server addresses or hostnames shown in UI
    document
      .querySelectorAll(".server-url, .endpoint-address")
      .forEach((el) => {
        el.textContent = "https://sparkyfitness.example.com";
      });
  });
  ```
- **Password input safety**: When typing credentials, ensure inputs are `type="password"` or obscured, and never echo passwords in terminal shell outputs.

---

## 2. Headless Chrome vs Other Tools

- Use Playwright with locally installed Google Chrome in **pure headless mode** (`headless: true`).
- Do **not** attempt remote DevTools debugging (`--remote-debugging-port`) or interactive agent attachments, as they can conflict with running sessions and sandboxes.
- Drive the browser programmatically using Playwright scripts executed via `node`.

---

## 3. Environment & Prerequisites

1. **Frontend Server**: The web app must be running (e.g. `pnpm dev` on port `5173` or `8080`).
2. **Google Chrome**: Standard desktop Chrome installed on the host.
3. **Playwright Module**: Available via `node_modules` (e.g. `npx playwright` or imported in scripts). When running scripts from external scratch directories, ensure Node can resolve Playwright by setting `NODE_PATH=./node_modules` or running the runner from the repository root.

---

## 4. Vite-Safe API Mocking & Interception

When mocking or intercepting network responses in Vite development mode, follow this **critical rule**:

> [!CAUTION]
> **Vite serves TypeScript and JavaScript files as native ES modules.**
> Never intercept with a blind glob like `page.route('**/api/**', ...)`!
> A pattern like `**/api/**` also matches source code imports like `http://localhost:5173/src/api/api.ts` or `/src/api/Foods/foodService.ts`. Intercepting those with JSON will break the entire web app with `TypeError: Failed to fetch dynamically imported module`.

### Safe Pathname Matching Pattern

Always parse the URL and verify that `pathname` begins with `/api/`:

```js
await page.route("**/*", async (route) => {
  const url = route.request().url();
  const parsed = new URL(url);

  // Strictly match backend API endpoints, ignoring frontend /src/api/* modules
  if (parsed.pathname.startsWith("/api/")) {
    // Medication list endpoint requested by medicationService.ts (/api/v2/medications)
    if (
      parsed.pathname === "/api/v2/medications" &&
      route.request().method() === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockMedications),
      });
    }
    // Allow non-mocked backend API calls to fall back to other handlers or network
    return route.fallback();
  }

  // Allow all static assets, JS, CSS, fonts to load normally
  return route.fallback();
});
```

---

## 5. Authenticated Session Setup

The web frontend checks session state using `authClient.useSession()` under `/api/auth` and loads accessible profiles via `/api/identity/users/accessible-users`. Mock these endpoints via `page.route` to supply synthetic session data without interactive login:

```js
const BASE_URL = process.env.FRONTEND_URL || "http://localhost:8080";
const context = await browser.newContext();
const page = await context.newPage();

await page.route("**/*", async (route) => {
  const parsed = new URL(route.request().url());
  if (parsed.pathname === "/api/auth/get-session") {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "test-user-id",
          name: "Test User",
          email: "user@example.com",
        },
        session: { id: "test-session-id", userId: "test-user-id" },
      }),
    });
  }
  if (parsed.pathname === "/api/identity/users/accessible-users") {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  }
  return route.fallback();
});

await page.goto(`${BASE_URL}/medications`, { waitUntil: "networkidle" });
```

---

## 6. Screenshots & Downscaling

- Take targeted component or viewport screenshots rather than bloated full-page images unless full-page layout verification is explicitly required:
  ```js
  await page.screenshot({
    path: `${artifactDir}/web_medication_live_calc.png`,
  });
  ```
- **Downscale if needed**: If file size is large, resize with macOS `sips`:
  ```bash
  sips -Z 800 input.png --out downscaled.png
  ```
- Embed the screenshots as markdown links in your reply or artifact.

---

## 7. Reusable Playwright Runner Script Template

Save scratch runners in `<appDataDir>/brain/<conversation-id>/scratch/run_playwright.mjs`. When invoking from a scratch directory, run with `NODE_PATH=./node_modules node <script>` or place the runner under the repository root so `playwright` is resolved cleanly.

```js
import { chromium } from "playwright";
import fs from "fs";

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || ".";

const executablePath =
  process.env.CHROME_PATH ||
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : "/usr/bin/google-chrome");

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  // 1. Intercept APIs safely
  await page.route("**/*", async (route) => {
    const parsed = new URL(route.request().url());
    if (parsed.pathname.startsWith("/api/")) {
      // Mock specific endpoints or fall back
      return route.fallback();
    }
    return route.fallback();
  });

  const BASE_URL = process.env.FRONTEND_URL || "http://localhost:8080";

  // 2. Navigate and wait for relevant UI element
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main, #root, [data-testid]", {
    state: "visible",
    timeout: 10000,
  });

  // 3. Redact any sensitive data before screenshot
  await page.evaluate(() => {
    document.querySelectorAll("[data-pii], .user-email").forEach((el) => {
      el.textContent = "user@example.com";
    });
  });

  // 4. Capture screenshot
  await page.screenshot({ path: `${ARTIFACT_DIR}/web_verification.png` });

  await browser.close();
  console.log("Playwright run completed successfully.");
}

run().catch((err) => {
  const sanitized = (err?.stack || err?.message || String(err)).replace(
    /https?:\/\/[^\s]+/g,
    "[REDACTED_URL]",
  );
  console.error("Playwright execution error:", sanitized);
  process.exit(1);
});
```

---

## 8. Cleanup & Reporting

- Always close the browser (`await browser.close()`).
- Terminate any background Node or helper processes.
- Report what was tested, DOM assertions verified, and link generated screenshots.
