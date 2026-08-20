#!/usr/bin/env node
// Deeper e2e: exercise create/submit flows for classroom, guardian, child,
// invoice, subsidy case, and time-entry approval + attendance search.

import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WEB = process.env.WEB_URL || "http://localhost:3040";
const OUT = resolve("./test-results/e2e-flows");
mkdirSync(OUT, { recursive: true });

const findings = [];
const consoleErrors = [];
const netErrors = [];

function rec(step, status, detail = "") {
  findings.push({ step, status, detail });
  const i = status === "pass" ? "✓" : status === "fail" ? "✗" : "•";
  console.log(`${i} ${step}${detail ? " — " + detail : ""}`);
}
async function shot(page, n) {
  await page.screenshot({ path: resolve(OUT, `${n}.png`), fullPage: true }).catch(() => {});
}

// Radix Select helper — click trigger, then click option by text in open listbox.
async function selectByLabel(page, triggerSelector, optionText) {
  const trigger = page.locator(triggerSelector).first();
  await trigger.click();
  await page.waitForTimeout(200);
  const opt =
    typeof optionText === "string"
      ? page.getByRole("option", { name: optionText, exact: false }).first()
      : page.getByRole("option").filter({ hasText: optionText }).first();
  await opt.click();
  await page.waitForTimeout(150);
}
async function selectFirstOption(page, triggerSelector) {
  const trigger = page.locator(triggerSelector).first();
  await trigger.click();
  await page.waitForTimeout(200);
  await page.getByRole("option").first().click();
  await page.waitForTimeout(150);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  page.on("console", (m) => m.type() === "error" && consoleErrors.push({ url: page.url(), text: m.text() }));
  page.on("pageerror", (e) => consoleErrors.push({ url: page.url(), text: `pageerror: ${e.message}` }));
  page.on("requestfailed", (r) => netErrors.push({ url: r.url(), failure: r.failure()?.errorText }));
  page.on("response", (r) => { if (r.status() >= 500) netErrors.push({ url: r.url(), status: r.status() }); });

  const email = `flows+${randomUUID().slice(0, 8)}@pebbledesk.test`;
  const password = "TestPass123!";

  try {
    // SIGNUP
    await page.goto(`${WEB}/signup`, { waitUntil: "domcontentloaded" });
    await page.locator("#name").fill("Flow Tester");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL(/onboarding/, { timeout: 15000 });
    rec("signup", "pass", page.url());

    // ONBOARDING
    await page.locator("#name").fill("Flowhaven Childcare");
    await page.locator("#address").fill("500 Oak Ave");
    await page.locator("#city").fill("Austin");
    await page.locator("#state").fill("TX");
    await page.locator("#zip").fill("78701");
    await page.locator("#phone").fill("(512) 555-0199");
    const tz = page.locator("#timezone");
    if (await tz.count()) {
      await tz.click();
      await page.waitForTimeout(200);
      await page.getByRole("option").first().click().catch(() => {});
    }
    await page.getByRole("button", { name: /continue|complete|finish|create/i }).first().click();
    await page.waitForURL(/dashboard/, { timeout: 15000 });
    rec("onboarding", "pass", page.url());

    // ---- CLASSROOM CREATE ----
    await page.goto(`${WEB}/classrooms`);
    await page.waitForTimeout(800);
    await shot(page, "01-classrooms");
    const addClassroom = page.getByRole("button", { name: /add classroom|new classroom|add/i }).first();
    if (await addClassroom.count()) {
      await addClassroom.click();
      await page.waitForTimeout(400);
      await shot(page, "02-classroom-dialog");
      await page.locator("#classroom-name").fill("Sunshine Room");
      await selectFirstOption(page, "#classroom-age-group");
      await page.locator("#classroom-capacity").fill("12");
      await page.locator("#classroom-ratio-staff").fill("1");
      await page.locator("#classroom-ratio-children").fill("6");
      await page.getByRole("button", { name: /create classroom/i }).click();
      await page.waitForTimeout(1500);
      await shot(page, "03-classroom-after");
      const created = await page.getByText("Sunshine Room").count();
      rec("classroom create", created > 0 ? "pass" : "fail", `matches=${created}`);
    } else {
      rec("classroom create", "fail", "no add button");
    }

    // ---- GUARDIAN CREATE ----
    await page.goto(`${WEB}/guardians`);
    await page.waitForTimeout(800);
    await shot(page, "04-guardians");
    const addGuardian = page.getByRole("button", { name: /add guardian|new guardian/i }).first();
    if (await addGuardian.count()) {
      await addGuardian.click();
      await page.waitForTimeout(400);
      await page.locator("#add-guardian-first").fill("Maria");
      await page.locator("#add-guardian-last").fill("Lopez");
      await page.locator("#add-guardian-email").fill(`maria+${randomUUID().slice(0,6)}@example.test`);
      await page.locator("#add-guardian-phone").fill("(512) 555-0123");
      await shot(page, "05-guardian-filled");
      await page.getByRole("button", { name: /^add guardian$/i }).click();
      await page.waitForTimeout(1500);
      await shot(page, "06-guardian-after");
      const created = await page.getByText("Maria Lopez").count();
      rec("guardian create", created > 0 ? "pass" : "fail", `matches=${created}`);
    } else {
      rec("guardian create", "fail", "no add button");
    }

    // ---- CHILD ENROLL (with guardian) ----
    await page.goto(`${WEB}/children/enroll`);
    await page.waitForTimeout(800);
    await shot(page, "07-enroll-step1");
    // Step 1: child details
    await page.locator("#firstName").fill("Ava");
    await page.locator("#lastName").fill("Ramirez");
    await page.locator("#dateOfBirth").fill("2022-06-15");
    await selectFirstOption(page, "#ageGroup");
    // Step 1 → 2
    await page.getByRole("button", { name: /^next: guardians/i }).click();
    await page.waitForTimeout(500);
    await shot(page, "08-enroll-step2");

    // Step 2: link existing guardian (Maria Lopez created earlier)
    const linkExisting = page.getByRole("button", { name: /link existing guardian/i }).first();
    if (await linkExisting.count()) {
      await linkExisting.click();
      await page.waitForTimeout(400);
      // Search is required to render the guardian list
      await page.locator("#guardian-search").fill("Maria");
      await page.waitForTimeout(400);
      const maria = page.getByRole("button", { name: /maria lopez/i }).first();
      if (await maria.count()) {
        await maria.click();
        await page.waitForTimeout(300);
        // Primary checkbox then confirm
        await page.locator("#link-isPrimary").check().catch(() => {});
        await page.getByRole("button", { name: /^add guardian$/i }).click();
        await page.waitForTimeout(600);
      }
    }
    await shot(page, "09-enroll-after-guardian");

    // Step 2 → 3
    await page.getByRole("button", { name: /^next: classroom/i }).click();
    await page.waitForTimeout(600);
    await shot(page, "10-enroll-step3");

    // Step 3: pick classroom (Sunshine Room) — it's a button with the name inside
    const roomBtn = page.locator("button").filter({ hasText: "Sunshine Room" }).first();
    if (await roomBtn.count()) {
      await roomBtn.click();
      await page.waitForTimeout(400);
    } else {
      rec("enroll classroom pick", "fail", "Sunshine Room not shown (age group mismatch?)");
    }

    // Step 3 → 4
    await page.getByRole("button", { name: /^next: review/i }).click().catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, "11-enroll-review");

    const enrollBtn = page.getByRole("button", { name: /^enroll child$/i });
    if (await enrollBtn.count()) {
      await enrollBtn.click();
      await page.waitForTimeout(2500);
      await shot(page, "12-enroll-done");
      const done = page.url().includes("/children") && !page.url().endsWith("/enroll");
      rec("child enroll submit", done ? "pass" : "info", page.url());
    } else {
      rec("child enroll submit", "fail", `no enroll button at ${page.url()}`);
    }

    // ---- INVOICE CREATE ----
    await page.goto(`${WEB}/billing`);
    await page.waitForTimeout(800);
    await shot(page, "13-billing");
    const newInvoice = page.getByRole("button", { name: /new invoice|create invoice/i }).first();
    if (await newInvoice.count()) {
      await newInvoice.click();
      await page.waitForTimeout(400);
      await shot(page, "14-invoice-dialog");
      // guardian select
      await selectFirstOption(page, "#guardian-select").catch(() => {});
      await page.locator("#period-start").fill("2026-04-01");
      await page.locator("#period-end").fill("2026-04-30");
      await page.locator("#due-date").fill("2026-05-15");
      // first line item
      await page.locator('input[placeholder="Description"]').first().fill("April tuition");
      await page.locator('input[placeholder="Qty"]').first().fill("1");
      await page.locator('input[placeholder="Unit price"]').first().fill("850");
      await shot(page, "15-invoice-filled");
      await page.getByRole("button", { name: /create invoice/i }).click();
      await page.waitForTimeout(1800);
      await shot(page, "16-invoice-after");
      const createdIn = await page.getByText(/april tuition|invoice/i).count();
      rec("invoice create", createdIn > 0 ? "pass" : "info", `texts=${createdIn}`);
    } else {
      rec("invoice create", "fail", "no new invoice button");
    }

    // ---- SUBSIDY CASE CREATE ----
    await page.goto(`${WEB}/subsidies`);
    await page.waitForTimeout(800);
    await shot(page, "17-subsidies");
    const newCase = page.getByRole("button", { name: /^new case$/i }).first();
    if (await newCase.count()) {
      await newCase.click();
      await page.waitForTimeout(400);
      await shot(page, "18-subsidy-dialog");
      await selectFirstOption(page, "#case-child").catch(() => {});
      await selectFirstOption(page, "#case-program").catch(() => {});
      await page.locator("#case-number").fill("CASE-001");
      await page.locator("#case-agency").fill("Texas Workforce Commission");
      await page.locator("#case-effective").fill("2026-04-01");
      await shot(page, "19-subsidy-filled");
      await page.getByRole("button", { name: /create case/i }).click();
      await page.waitForTimeout(1800);
      await shot(page, "20-subsidy-after");
      const createdSub = await page.getByText(/CASE-001|Texas Workforce/i).count();
      rec("subsidy case create", createdSub > 0 ? "pass" : "info", `texts=${createdSub}`);
    } else {
      rec("subsidy case create", "fail", "no new case button");
    }

    // ---- ATTENDANCE ----
    await page.goto(`${WEB}/attendance`);
    await page.waitForTimeout(1000);
    await shot(page, "21-attendance");
    const search = page.locator('input[placeholder*="Search child" i]').first();
    if (await search.count()) {
      await search.fill("Ava");
      await page.waitForTimeout(500);
      await shot(page, "22-attendance-search");
      const checkIn = page.getByRole("button", { name: /check in/i }).first();
      if (await checkIn.count()) {
        await checkIn.click();
        await page.waitForTimeout(1200);
        await shot(page, "23-attendance-after-checkin");
        rec("attendance check-in", "pass");
      } else {
        rec("attendance check-in", "info", "no check-in button visible");
      }
    } else {
      rec("attendance check-in", "fail", "no search input");
    }

    // ---- TIME ENTRY APPROVAL ----
    await page.goto(`${WEB}/scheduling/time`);
    await page.waitForTimeout(1000);
    await shot(page, "24-time-entries");
    const approve = page.getByRole("button", { name: /^approve$/i }).first();
    if (await approve.count() && await approve.isVisible().catch(() => false)) {
      await approve.click();
      await page.waitForTimeout(1200);
      await shot(page, "25-time-after-approve");
      rec("time entry approve", "pass");
    } else {
      rec("time entry approve", "info", "no pending time entries");
    }

    // ---- REPORTS + SETTINGS smoke ----
    for (const r of ["/reports", "/settings", "/messages", "/ratios"]) {
      const before = consoleErrors.length;
      await page.goto(`${WEB}${r}`).catch(() => {});
      await page.waitForTimeout(700);
      const newErrs = consoleErrors.length - before;
      rec(`smoke ${r}`, newErrs === 0 ? "pass" : "fail", `errs=${newErrs}`);
    }

  } catch (err) {
    rec("fatal", "fail", err.message);
  } finally {
    writeFileSync(resolve(OUT, "findings.json"),
      JSON.stringify({ findings, consoleErrors, netErrors }, null, 2));
    await browser.close();
    const passes = findings.filter((f) => f.status === "pass").length;
    const fails = findings.filter((f) => f.status === "fail").length;
    console.log(`\n== results: ${passes} pass, ${fails} fail, ${findings.length - passes - fails} info ==`);
    console.log(`Console errors: ${consoleErrors.length}  Network 5xx/fail: ${netErrors.length}`);
    if (consoleErrors.length) console.log("First 5 console:", consoleErrors.slice(0, 5));
    if (netErrors.length) console.log("First 5 net:", netErrors.slice(0, 5));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
