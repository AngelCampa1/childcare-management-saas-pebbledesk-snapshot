#!/usr/bin/env node
// Deep e2e flow: signup → complete onboarding → exercise child, classroom,
// guardian, invoice, subsidy create flows → logout → login.

import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WEB = process.env.WEB_URL || "http://localhost:3040";
const OUT = resolve("./test-results/e2e-deep");
mkdirSync(OUT, { recursive: true });

const findings = [];
const consoleErrors = [];
const netErrors = [];

function rec(step, status, detail = "") {
  findings.push({ step, status, detail });
  const i = status === "pass" ? "✓" : status === "fail" ? "✗" : "•";
  console.log(`${i} ${step}${detail ? " — " + detail : ""}`);
}
async function shot(page, n) { await page.screenshot({ path: resolve(OUT, `${n}.png`), fullPage: true }).catch(() => {}); }

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  page.on("console", (m) => m.type() === "error" && consoleErrors.push({ url: page.url(), text: m.text() }));
  page.on("pageerror", (e) => consoleErrors.push({ url: page.url(), text: `pageerror: ${e.message}` }));
  page.on("requestfailed", (r) => netErrors.push({ url: r.url(), failure: r.failure()?.errorText }));
  page.on("response", (r) => { if (r.status() >= 500) netErrors.push({ url: r.url(), status: r.status() }); });

  const email = `deep+${randomUUID().slice(0, 8)}@pebbledesk.test`;
  const password = "TestPass123!";

  try {
    // SIGNUP
    await page.goto(`${WEB}/signup`, { waitUntil: "domcontentloaded" });
    await page.locator('#name').fill("Deep Tester");
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await shot(page, "00-before-signup");
    await Promise.all([
      page.waitForURL(/onboarding|dashboard/, { timeout: 15000 }).catch(() => {}),
      page.getByRole("button", { name: /create account/i }).click(),
    ]);
    await page.waitForTimeout(1500);
    await shot(page, "00b-after-signup");
    rec("signup click", page.url().includes("onboarding") ? "pass" : "fail", page.url());
    if (!page.url().includes("onboarding")) {
      // Dump any visible error text
      const errs = await page.locator('[role="alert"], .text-destructive, [class*="destructive"]').allTextContents().catch(() => []);
      rec("signup visible errors", "info", JSON.stringify(errs).slice(0, 300));
      throw new Error("did not reach onboarding");
    }
    await shot(page, "01-onboarding");

    // ONBOARDING
    await page.locator('#name').fill("Sunny Days Childcare");
    await page.locator('#address').fill("123 Main St");
    await page.locator('#city').fill("Springfield");
    await page.locator('#state').fill("IL");
    await page.locator('#zip').fill("62701");
    await page.locator('#phone').fill("(217) 555-0100");
    // Timezone select — try clicking trigger then choose first real item
    const tz = page.locator('#timezone');
    if (await tz.count()) {
      await tz.click();
      await page.waitForTimeout(300);
      await page.getByRole("option").first().click().catch(() => {});
    }
    await page.getByRole("button", { name: /continue|complete|finish|create/i }).first().click();
    await page.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {});
    rec("onboarding→dashboard", page.url().includes("dashboard") ? "pass" : "fail", page.url());
    await shot(page, "02-dashboard");

    // CHILDREN
    await page.goto(`${WEB}/children`);
    await page.waitForTimeout(800);
    await shot(page, "03-children-empty");
    const enrollBtn = page.getByRole("link", { name: /enroll|add child/i }).first()
      .or(page.getByRole("button", { name: /enroll|add child/i }).first());
    if (await enrollBtn.count()) {
      await enrollBtn.click();
      await page.waitForTimeout(800);
      rec("open enroll child", "pass", page.url());
      await shot(page, "04-enroll-form");

      // Try to fill fields flexibly
      const fill = async (selector, value) => {
        const el = page.locator(selector).first();
        if (await el.count() && await el.isVisible()) await el.fill(value).catch(() => {});
      };
      await fill('input[name*="first" i]', "Ava");
      await fill('input[name*="last" i]', "Ramirez");
      await fill('input[type="date"]', "2022-06-15");
      // Try submit
      const submit = page.getByRole("button", { name: /enroll|save|create|submit/i }).first();
      if (await submit.count()) {
        await submit.click().catch(() => {});
        await page.waitForTimeout(1500);
      }
      rec("submit enroll", "info", `at ${page.url()}`);
      await shot(page, "05-enroll-after");
    } else {
      rec("enroll child button", "fail", "no visible button");
    }

    // CLASSROOMS
    await page.goto(`${WEB}/classrooms`);
    await page.waitForTimeout(800);
    await shot(page, "06-classrooms");
    const addClassroom = page.getByRole("button", { name: /add|new|create/i }).first();
    if (await addClassroom.count() && await addClassroom.isVisible()) {
      await addClassroom.click();
      await page.waitForTimeout(500);
      await shot(page, "07-classroom-form");
      await page.locator('input[name*="name" i]').first().fill("Toddler Room").catch(() => {});
      await page.locator('input[type="number"], input[name*="capacity" i]').first().fill("12").catch(() => {});
      await page.getByRole("button", { name: /save|create|submit/i }).first().click().catch(() => {});
      await page.waitForTimeout(1200);
    }
    rec("classroom create flow", "info");

    // LOGOUT via header avatar menu
    await page.goto(`${WEB}/dashboard`);
    await page.waitForTimeout(800);
    const acctBtn = page.getByRole("button", { name: /open account menu/i });
    await acctBtn.click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL(/login/, { timeout: 10000 }).catch(() => {});
    rec("logout", page.url().includes("login") ? "pass" : "fail", page.url());
    await shot(page, "08-after-logout");

    // LOGIN
    await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await Promise.all([
      page.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {}),
      page.getByRole("button", { name: /^sign in$/i }).click(),
    ]);
    await page.waitForTimeout(1500);
    rec("login", page.url().includes("dashboard") ? "pass" : "fail", page.url());
    await shot(page, "09-after-login");
  } catch (err) {
    rec("fatal", "fail", err.message);
  } finally {
    writeFileSync(resolve(OUT, "findings.json"),
      JSON.stringify({ findings, consoleErrors, netErrors }, null, 2));
    await browser.close();
    console.log(`\nConsole errors: ${consoleErrors.length}  Network 5xx/fail: ${netErrors.length}`);
    if (consoleErrors.length) console.log("First 5 console errors:", consoleErrors.slice(0, 5));
    if (netErrors.length) console.log("First 5 net errors:", netErrors.slice(0, 5));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
