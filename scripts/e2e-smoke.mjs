#!/usr/bin/env node
// End-to-end smoke test driver.
// Boots a Chromium browser via playwright, walks through major flows, logs
// findings as JSON. Each step records {step, status, detail, url, consoleErrors}.

import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WEB = process.env.WEB_URL || "http://localhost:3040";
const API = process.env.API_URL || "http://localhost:8790";
const OUT = resolve("./test-results/e2e");
mkdirSync(OUT, { recursive: true });

const findings = [];
const consoleErrors = [];
const networkErrors = [];
// Returns true when a 4xx API response is expected / harmless in this smoke run.
// Rule 1 — always expected: single-center users get 403 on multi-center overview.
// Rule 2 — always expected: transient 401 on auth/me before session is established.
// Rule 3 — always expected: 429 rate-limit hits from rapid automated navigation
//           (the smoke test makes far more req/min than a real user; this is by design).
function isExpected4xx(status, url) {
  if (/\/api\/overview\/multi-center/.test(url)) return true;
  if (status === 401 && /\/api\/auth\/me/.test(url)) return true;
  if (status === 429) return true;
  return false;
}

function record(step, status, detail = "", extra = {}) {
  const entry = { step, status, detail, ...extra };
  findings.push(entry);
  const icon = status === "pass" ? "✓" : status === "fail" ? "✗" : "•";
  console.log(`${icon} ${step}${detail ? " — " + detail : ""}`);
}

async function screenshot(page, name) {
  const path = resolve(OUT, `${name}.png`);
  try { await page.screenshot({ path, fullPage: true }); } catch (_) {}
  return path;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Track page-level JS errors (uncaught exceptions, not failed fetches)
  page.on("pageerror", (err) => {
    consoleErrors.push({ url: page.url(), text: `pageerror: ${err.message}` });
  });
  page.on("requestfailed", (req) => {
    networkErrors.push({ url: req.url(), failure: req.failure()?.errorText });
  });
  // Track unexpected API errors (4xx that aren't on the allow-list, and all 5xx)
  const unexpectedApiErrors = [];
  page.on("response", (res) => {
    const url = res.url();
    const status = res.status();
    if (status >= 500) {
      networkErrors.push({ url, status });
    }
    if (status >= 400 && status < 500 && url.includes("/api/")) {
      if (!isExpected4xx(status, url)) {
        unexpectedApiErrors.push({ url, status, pageUrl: page.url() });
      }
    }
  });

  const email = `test+${randomUUID().slice(0, 8)}@pebbledesk.test`;
  const password = "TestPass123!";
  const name = "E2E Tester";

  try {
    // 1. Landing / unauthenticated access should redirect to login
    await page.goto(`${WEB}/`, { waitUntil: "domcontentloaded", timeout: 15000 });
    record("nav /", "info", `landed at ${page.url()}`);
    await screenshot(page, "01-root");

    // 2. Open signup
    await page.goto(`${WEB}/signup`, { waitUntil: "domcontentloaded" });
    record("nav /signup", page.url().includes("signup") ? "pass" : "fail", page.url());
    await screenshot(page, "02-signup");

    // 3. Attempt signup
    const hasName = await page.locator('input[name="name"], input[id="name"], input[placeholder*="name" i]').first().count();
    const hasEmail = await page.locator('input[type="email"]').first().count();
    const hasPassword = await page.locator('input[type="password"]').first().count();
    record("signup form fields present", hasName && hasEmail && hasPassword ? "pass" : "fail",
      `name=${hasName} email=${hasEmail} password=${hasPassword}`);

    if (hasName && hasEmail && hasPassword) {
      await page.locator('input[type="email"]').first().fill(email);
      await page.locator('input[type="password"]').first().fill(password);
      const nameInput = page.locator('input[name="name"], input[id="name"], input[placeholder*="name" i]').first();
      await nameInput.fill(name);

      const submitBtn = page.getByRole("button", { name: /sign up|create account|continue|get started/i }).first();
      await submitBtn.click().catch(() => {});
      // Wait for navigation or API response
      await page.waitForTimeout(3000);
      record("after signup submit", "info", `at ${page.url()}`);
      await screenshot(page, "03-after-signup");
    }

    // 4. Onboarding
    if (page.url().includes("onboarding")) {
      record("reached onboarding", "pass");
      await screenshot(page, "04-onboarding");
      // Fill all required fields
      const nameInput = page.locator('input[name="name"], input[id="name"]').first();
      if (await nameInput.count()) await nameInput.fill("E2E Smoke Childcare");
      const addressInput = page.locator('input[name="address"], input[id="address"]').first();
      if (await addressInput.count()) await addressInput.fill("123 Test Street");
      const cityInput = page.locator('input[name="city"], input[id="city"]').first();
      if (await cityInput.count()) await cityInput.fill("Springfield");
      const stateInput = page.locator('input[name="state"], input[id="state"]').first();
      if (await stateInput.count()) await stateInput.fill("IL");
      const zipInput = page.locator('input[name="zip"], input[id="zip"]').first();
      if (await zipInput.count()) await zipInput.fill("62701");
      const phoneInput = page.locator('input[name="phone"], input[id="phone"]').first();
      if (await phoneInput.count()) await phoneInput.fill("(217) 555-0100");
      // Submit the form
      const submitBtn = page.getByRole("button", { name: /continue to dashboard|create center|finish|submit/i }).first();
      if (await submitBtn.count() && await submitBtn.isVisible()) {
        await submitBtn.click().catch(() => {});
        await page.waitForTimeout(3000);
      }
      record("onboarding stepped", "info", `at ${page.url()}`);
      await screenshot(page, "05-onboarding-done");
    } else {
      record("onboarding not reached", "fail", `at ${page.url()}`);
    }

    // 5. Dashboard
    if (!page.url().includes("dashboard")) {
      await page.goto(`${WEB}/dashboard`, { waitUntil: "domcontentloaded" }).catch(() => {});
    }
    record("nav /dashboard", page.url().includes("dashboard") ? "pass" : "fail", page.url());
    await screenshot(page, "06-dashboard");

    // 6. Walk auth-gated routes
    const routes = [
      "/children", "/classrooms", "/ratios", "/attendance",
      "/guardians", "/billing", "/subsidies", "/messages",
      "/reports", "/scheduling", "/settings",
    ];
    for (const r of routes) {
      const beforeApiErrs = unexpectedApiErrors.length;
      const beforePageErrs = consoleErrors.length;
      await page.goto(`${WEB}${r}`, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const gotThere = page.url().includes(r);
      const newApiErrs = unexpectedApiErrors.length - beforeApiErrs;
      const newPageErrs = consoleErrors.length - beforePageErrs;
      const passed = gotThere && newApiErrs === 0 && newPageErrs === 0;
      record(`nav ${r}`, passed ? "pass" : "fail",
        `url=${page.url()} apiErrors=${newApiErrs} pageErrors=${newPageErrs}`);
      await screenshot(page, `route${r.replace(/\//g, "_")}`);
    }

  } catch (err) {
    record("fatal", "fail", err.message);
  } finally {
    writeFileSync(resolve(OUT, "findings.json"),
      JSON.stringify({ findings, consoleErrors, networkErrors, unexpectedApiErrors }, null, 2));
    await browser.close();
    console.log(`\nPage errors: ${consoleErrors.length}  Network errors: ${networkErrors.length}  Unexpected API errors: ${unexpectedApiErrors.length}`);
    console.log(`Details: ${resolve(OUT, "findings.json")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
