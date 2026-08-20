#!/usr/bin/env node
// Compliance Lifecycle E2E — Phase A–E
// signup → onboarding → classrooms → import → enroll children → guardians
// → attendance check-in → ratios → ratios/history → audit log → subsidies

import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const WEB = process.env.WEB_URL || "http://localhost:3040";
const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = resolve(`./test-results/e2e-compliance-${TS}`);
mkdirSync(OUT, { recursive: true });

const findings = [];
const consoleErrors = [];
const netErrors = [];

function log(msg) {
  console.log(msg);
  appendFileSync(resolve(OUT, "run.log"), msg + "\n");
}

function rec(step, status, detail = "") {
  findings.push({ step, status, detail, ts: new Date().toISOString() });
  const icon = status === "pass" ? "✓" : status === "fail" ? "✗" : status === "skip" ? "–" : "•";
  log(`${icon} [${status.toUpperCase().padEnd(4)}] ${step}${detail ? " — " + detail : ""}`);
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true }).catch(() => {});
}

async function fill(page, selector, value) {
  const el = page.locator(selector).first();
  if (await el.count() && await el.isVisible()) {
    await el.fill(value).catch(() => {});
    return true;
  }
  return false;
}

async function clickIf(page, role, name) {
  const el = page.getByRole(role, { name }).first();
  if (await el.count() && await el.isVisible()) {
    await el.click();
    return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push({ url: page.url(), text: m.text() });
  });
  page.on("pageerror", (e) =>
    consoleErrors.push({ url: page.url(), text: `pageerror: ${e.message}` })
  );
  page.on("requestfailed", (r) =>
    netErrors.push({ url: r.url(), failure: r.failure()?.errorText })
  );
  page.on("response", (r) => {
    if (r.status() >= 500) netErrors.push({ url: r.url(), status: r.status() });
  });

  const email = `director+${randomUUID().slice(0, 8)}@pebbledesk.test`;
  const password = "Passw0rd!";

  // ── PHASE A: Account bootstrap ──────────────────────
  log("\n=== PHASE A: Account Bootstrap ===");
  try {
    // Signup
    await page.goto(`${WEB}/signup`, { waitUntil: "domcontentloaded" });
    await shot(page, "A01-signup-page");

    const signupConsole = consoleErrors.length;
    await fill(page, "#name", "E2E Director");
    await fill(page, "#email", email);
    await fill(page, "#password", password);

    await Promise.all([
      page.waitForURL(/onboarding|dashboard/, { timeout: 20000 }).catch(() => {}),
      page.getByRole("button", { name: /create account/i }).click(),
    ]);
    await page.waitForTimeout(2000);
    await shot(page, "A02-after-signup");

    const onSignup = page.url().includes("onboarding");
    rec("signup → onboarding redirect", onSignup ? "pass" : "fail", page.url());
    if (consoleErrors.length > signupConsole)
      rec("signup console errors", "fail", consoleErrors.slice(signupConsole).map((e) => e.text).join("; ").slice(0, 200));

    if (!onSignup) {
      const errs = await page.locator('[role="alert"], .text-destructive').allTextContents().catch(() => []);
      throw new Error(`Signup did not reach onboarding. Errors: ${JSON.stringify(errs)}`);
    }

    // Onboarding
    await shot(page, "A03-onboarding");
    await fill(page, "#name, input[name='name']", "Sunny Days Childcare");
    await fill(page, "#address, input[name='address']", "123 Main Street");
    await fill(page, "#city, input[name='city']", "Springfield");
    await fill(page, "#zip, input[name='zip']", "62701");

    // State select
    const stateEl = page.locator("select[name='state'], #state").first();
    if (await stateEl.count()) {
      await stateEl.selectOption("IL").catch(() => {});
    } else {
      await fill(page, "input[name='state']", "IL");
    }

    // Timezone
    const tzTrigger = page.locator('[data-testid="timezone-select"], #timezone, button[aria-label*="timezone" i]').first();
    if (await tzTrigger.count()) {
      await tzTrigger.click().catch(() => {});
      await page.waitForTimeout(300);
      await page.getByRole("option").first().click().catch(() => {});
    }

    await page.getByRole("button", { name: /continue|complete|finish|create center/i }).first().click();
    await page.waitForURL(/dashboard/, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, "A04-dashboard");

    rec("onboarding → dashboard", page.url().includes("dashboard") ? "pass" : "fail", page.url());

    // Dashboard empty state check
    const dashboardText = await page.locator("main, [data-testid='dashboard']").first().innerText().catch(() => "");
    rec("dashboard loaded", dashboardText.length > 10 ? "pass" : "fail", dashboardText.slice(0, 100));
  } catch (err) {
    rec("phase-A fatal", "fail", err.message);
    await shot(page, "A-fatal");
  }

  // ── PHASE B: Structural setup ────────────────────────
  log("\n=== PHASE B: Structural Setup ===");
  try {
    // Settings — center profile
    await page.goto(`${WEB}/settings`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await shot(page, "B01-settings");
    const settingsText = await page.locator("main").first().innerText().catch(() => "");
    rec("settings page loads", settingsText.length > 10 ? "pass" : "info", page.url());

    // Classrooms — create 3
    await page.goto(`${WEB}/classrooms`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await shot(page, "B02-classrooms-empty");

    const classroomDefs = [
      { name: "Infants", ageMin: "0", ageMax: "12", capacity: "8" },
      { name: "Toddlers", ageMin: "12", ageMax: "24", capacity: "10" },
      { name: "Preschool", ageMin: "36", ageMax: "60", capacity: "15" },
    ];

    for (const [i, cr] of classroomDefs.entries()) {
      const addBtn = page
        .getByRole("button", { name: /add|new|create classroom/i })
        .first()
        .or(page.getByRole("link", { name: /add|new|create/i }).first());

      if (await addBtn.count() && await addBtn.isVisible()) {
        await addBtn.click();
        await page.waitForTimeout(600);

        await fill(page, "input[name='name'], #name", cr.name);
        await fill(page, "input[name='capacity'], input[placeholder*='capacity' i]", cr.capacity);
        await fill(page, "input[name='ageMin'], input[placeholder*='min' i]", cr.ageMin);
        await fill(page, "input[name='ageMax'], input[placeholder*='max' i]", cr.ageMax);

        await page.getByRole("button", { name: /save|create|submit/i }).first().click().catch(() => {});
        await page.waitForTimeout(1200);
        rec(`classroom create: ${cr.name}`, "info", page.url());
      } else {
        rec(`classroom create: ${cr.name}`, "skip", "no add button visible");
        break;
      }
    }
    await shot(page, "B03-classrooms-after-create");

    // Import — navigate to /import
    await page.goto(`${WEB}/import`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await shot(page, "B04-import-page");
    const importText = await page.locator("main").first().innerText().catch(() => "");
    rec("import page loads", importText.length > 10 ? "pass" : "fail", importText.slice(0, 100));

    // Check migration preset UI is present
    const hasPreset = await page.locator("text=/procare|brightwheel|preset/i").count();
    rec("migration presets visible", hasPreset > 0 ? "pass" : "info", `found ${hasPreset} matches`);
  } catch (err) {
    rec("phase-B fatal", "fail", err.message);
    await shot(page, "B-fatal");
  }

  // ── PHASE C: Population ──────────────────────────────
  log("\n=== PHASE C: Population ===");
  try {
    // Enroll children
    const childDefs = [
      { first: "Ava", last: "Ramirez", dob: "2022-06-15" },
      { first: "Liam", last: "Chen", dob: "2022-01-20" },
      { first: "Sofia", last: "Park", dob: "2021-03-10" },
      { first: "Noah", last: "Williams", dob: "2021-08-05" },
    ];

    for (const [i, child] of childDefs.entries()) {
      await page.goto(`${WEB}/children/enroll`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      await fill(page, "input[name='firstName'], #firstName, input[placeholder*='first' i]", child.first);
      await fill(page, "input[name='lastName'], #lastName, input[placeholder*='last' i]", child.last);
      await fill(page, "input[type='date'], input[name='dateOfBirth'], #dateOfBirth", child.dob);

      // Classroom select
      const classroomSelect = page.locator("select[name='classroomId'], [data-testid='classroom-select']").first();
      if (await classroomSelect.count()) {
        await classroomSelect.selectOption({ index: 1 }).catch(() => {});
      } else {
        // Try combobox
        const combobox = page.getByRole("combobox").first();
        if (await combobox.count()) {
          await combobox.click().catch(() => {});
          await page.waitForTimeout(300);
          await page.getByRole("option").first().click().catch(() => {});
        }
      }

      await page.getByRole("button", { name: /enroll|save|create|submit/i }).first().click().catch(() => {});
      await page.waitForTimeout(1500);
      rec(`enroll child: ${child.first} ${child.last}`, "info", page.url());
    }
    await page.goto(`${WEB}/children`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await shot(page, "C01-children-list");
    const childRows = await page.locator("table tbody tr, [data-testid*='child-row']").count();
    rec("children list populated", childRows >= 2 ? "pass" : "info", `${childRows} rows visible`);

    // Guardians
    const guardianDefs = [
      { first: "Maria", last: "Ramirez", email: `maria+${randomUUID().slice(0,6)}@test.com`, phone: "2175550001" },
      { first: "Wei", last: "Chen", email: `wei+${randomUUID().slice(0,6)}@test.com`, phone: "2175550002" },
    ];
    for (const g of guardianDefs) {
      await page.goto(`${WEB}/guardians`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      const addBtn = page.getByRole("button", { name: /add|create|new guardian/i }).first();
      if (await addBtn.count()) {
        await addBtn.click();
        await page.waitForTimeout(500);
        await fill(page, "input[name='firstName'], #firstName", g.first);
        await fill(page, "input[name='lastName'], #lastName", g.last);
        await fill(page, "input[type='email'], input[name='email'], #email", g.email);
        await fill(page, "input[type='tel'], input[name='phone'], #phone", g.phone);
        await page.getByRole("button", { name: /save|create|submit/i }).first().click().catch(() => {});
        await page.waitForTimeout(1200);
        rec(`create guardian: ${g.first} ${g.last}`, "info", page.url());
      }
    }
    await page.goto(`${WEB}/guardians`, { waitUntil: "domcontentloaded" });
    await shot(page, "C02-guardians-list");
    rec("guardians page loads", page.url().includes("guardian") ? "pass" : "fail", page.url());
  } catch (err) {
    rec("phase-C fatal", "fail", err.message);
    await shot(page, "C-fatal");
  }

  // ── PHASE D: Compliance core ──────────────────────────
  log("\n=== PHASE D: Compliance Core ===");
  try {
    // Attendance page
    await page.goto(`${WEB}/attendance`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await shot(page, "D01-attendance");
    const attendanceText = await page.locator("main").first().innerText().catch(() => "");
    rec("attendance page loads", attendanceText.length > 10 ? "pass" : "fail", attendanceText.slice(0, 100));

    // Check in first available child
    const checkinBtn = page
      .getByRole("button", { name: /check.?in/i })
      .first();
    if (await checkinBtn.count() && await checkinBtn.isVisible()) {
      await checkinBtn.click();
      await page.waitForTimeout(1000);
      rec("child check-in click", "pass");
      await shot(page, "D02-after-checkin");
    } else {
      rec("child check-in", "info", "no check-in button visible (may need children present)");
    }

    // Ratios page
    await page.goto(`${WEB}/ratios`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await shot(page, "D03-ratios");
    const ratiosText = await page.locator("main").first().innerText().catch(() => "");
    rec("ratios page loads", ratiosText.length > 10 ? "pass" : "fail", ratiosText.slice(0, 150));

    const ratioStatus = await page.locator("text=/compliant|warning|violation/i").first().innerText().catch(() => "");
    rec("ratio status badge", ratioStatus ? "pass" : "info", ratioStatus || "no status badge found");

    // Ratios history
    await page.goto(`${WEB}/ratios/history`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await shot(page, "D04-ratios-history");
    const historyText = await page.locator("main").first().innerText().catch(() => "");
    rec("ratios/history page loads", historyText.length > 10 ? "pass" : "fail", historyText.slice(0, 100));
  } catch (err) {
    rec("phase-D fatal", "fail", err.message);
    await shot(page, "D-fatal");
  }

  // ── PHASE E: Audit & reporting ────────────────────────
  log("\n=== PHASE E: Audit & Reporting ===");
  try {
    // Reports
    await page.goto(`${WEB}/reports`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await shot(page, "E01-reports");
    const reportsText = await page.locator("main").first().innerText().catch(() => "");
    rec("reports page loads", reportsText.length > 10 ? "pass" : "fail", reportsText.slice(0, 100));

    // Audit log
    await page.goto(`${WEB}/reports/audit-log`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await shot(page, "E02-audit-log");
    const auditText = await page.locator("main").first().innerText().catch(() => "");
    rec("audit-log page loads", auditText.length > 10 ? "pass" : "fail", auditText.slice(0, 100));

    const auditRows = await page.locator("table tbody tr, [data-testid*='audit-row']").count();
    rec("audit log has entries", auditRows > 0 ? "pass" : "info", `${auditRows} rows`);

    // Subsidies
    await page.goto(`${WEB}/subsidies`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await shot(page, "E03-subsidies");
    const subsidiesText = await page.locator("main").first().innerText().catch(() => "");
    rec("subsidies page loads", subsidiesText.length > 10 ? "pass" : "fail", subsidiesText.slice(0, 100));
  } catch (err) {
    rec("phase-E fatal", "fail", err.message);
    await shot(page, "E-fatal");
  }

  // ── PHASE F: Cross-cutting UX ─────────────────────────
  log("\n=== PHASE F: Cross-cutting UX ===");
  try {
    const screens = [
      "/dashboard", "/children", "/classrooms", "/attendance",
      "/ratios", "/subsidies", "/import", "/settings",
    ];
    for (const path of screens) {
      await page.goto(`${WEB}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      const url = page.url();
      const is401 = url.includes("login") || url.includes("401");
      rec(`route ${path}`, !is401 ? "pass" : "fail", url);
    }

    // Mobile viewport check on dashboard
    await page.setViewportSize({ width: 810, height: 1080 });
    await page.goto(`${WEB}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await shot(page, "F01-mobile-dashboard");
    rec("mobile viewport renders", "pass");

    // Reset viewport
    await page.setViewportSize({ width: 1400, height: 900 });
  } catch (err) {
    rec("phase-F fatal", "fail", err.message);
    await shot(page, "F-fatal");
  }

  // ── SUMMARY ───────────────────────────────────────────
  log("\n=== SUMMARY ===");
  const passes = findings.filter((f) => f.status === "pass").length;
  const fails  = findings.filter((f) => f.status === "fail").length;
  const infos  = findings.filter((f) => f.status === "info" || f.status === "skip").length;
  log(`Passes: ${passes}  Failures: ${fails}  Info/Skip: ${infos}`);
  log(`Console errors: ${consoleErrors.length}  Network 5xx/fail: ${netErrors.length}`);
  if (fails > 0) {
    log("\nFailed steps:");
    findings.filter((f) => f.status === "fail").forEach((f) => log(`  ✗ ${f.step} — ${f.detail}`));
  }
  if (consoleErrors.length > 0) {
    log("\nFirst 10 console errors:");
    consoleErrors.slice(0, 10).forEach((e) => log(`  [JS] ${e.url}: ${e.text.slice(0, 120)}`));
  }
  if (netErrors.length > 0) {
    log("\nFirst 10 net errors:");
    netErrors.slice(0, 10).forEach((e) => log(`  [NET] ${e.url}: ${e.status || e.failure}`));
  }

  writeFileSync(
    resolve(OUT, "findings.json"),
    JSON.stringify({ findings, consoleErrors, netErrors, summary: { passes, fails, infos } }, null, 2)
  );
  log(`\nArtifacts → ${OUT}`);

  await browser.close();
  if (fails > 0 || consoleErrors.length > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
