// Records the demo walkthrough with Playwright's video recorder.
// usage: node scripts/record-demo.mjs [baseUrl]   -> video/raw.webm + video/marks.json
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const base = (process.argv[2] ?? "https://mandate-taupe.vercel.app").replace(/\/$/, "");
const outDir = path.resolve("video");
fs.mkdirSync(outDir, { recursive: true });
const cards = "file:///" + path.resolve("video/cards.html").replace(/\\/g, "/");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
  colorScheme: "dark",
});
const t0 = Date.now();
const marks = [];
const mark = (label) => {
  const t = (Date.now() - t0) / 1000;
  marks.push({ label, t: Number(t.toFixed(2)) });
  console.log(`${t.toFixed(1).padStart(6)}s  ${label}`);
};
const page = await context.newPage();

// A visible cursor so viewers can follow the clicks (headless video has none).
await page.addInitScript(() => {
  const css = `#__cur{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-3px,-2px);transition:transform 60ms linear}`;
  const svg = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l16 9-7 2-3 7z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  const install = () => {
    if (document.getElementById("__cur")) return;
    const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
    const d = document.createElement("div"); d.id = "__cur"; d.innerHTML = svg; document.body.appendChild(d);
    window.addEventListener("mousemove", (e) => { d.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
    window.addEventListener("mousedown", () => { d.style.scale = "0.85"; }, true);
    window.addEventListener("mouseup", () => { d.style.scale = "1"; }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cur = { x: 720, y: 450 };
async function glide(x, y, ms = 500) {
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = 1 - Math.pow(1 - i / steps, 3);
    await page.mouse.move(cur.x + (x - cur.x) * k, cur.y + (y - cur.y) * k);
    await sleep(ms / steps);
  }
  cur = { x, y };
}
async function click(locator, { hold = 700 } = {}) {
  const el = typeof locator === "string" ? page.locator(locator).first() : locator.first();
  await el.waitFor({ state: "visible", timeout: 30000 });
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  await glide(box.x + box.width / 2, box.y + box.height / 2, 600);
  await sleep(200);
  await el.click();
  await sleep(hold);
}
async function go(pathname, settle = 1500) {
  const link = page.locator(`aside a[href="${pathname}"]`);
  if (await link.count()) await click(link, { hold: 300 });
  else await page.goto(base + pathname, { waitUntil: "networkidle" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(settle);
}
async function card(name, ms) {
  await page.goto(`${cards}?card=${name}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await sleep(ms);
}

// ---- the walkthrough -------------------------------------------------------
mark("title card");
await card("title", 7000);

mark("overview");
await page.goto(base + "/", { waitUntil: "networkidle" });
await sleep(1500);
await glide(900, 300, 800);
await sleep(4000);

mark("mandate");
await go("/mandate");
await glide(400, 420, 900);
await sleep(3500);
mark("compile start");
await click(page.getByRole("button", { name: /Compile with AI/ }), { hold: 300 });
await page.getByText(/compiled by/).waitFor({ timeout: 120000 });
mark("compile done");
await glide(1000, 420, 900);
await sleep(6000);

mark("wallet");
await go("/wallet");
await glide(500, 330, 800);
await sleep(5500);

mark("agents");
await go("/agents");
await glide(1000, 420, 800);
await sleep(5500);

mark("playground");
await go("/playground");
await sleep(1500);
mark("run start");
await click(page.getByRole("button", { name: /Run selected agents/ }), { hold: 300 });
await glide(1000, 500, 800);
await page.getByRole("button", { name: /Run selected agents/ }).waitFor({ timeout: 180000 });
mark("run done");
await sleep(5000);

mark("approvals");
await go("/approvals");
await sleep(2500);
mark("approve click");
await click(page.getByRole("button", { name: /Approve and pay/ }), { hold: 300 });
await page.getByText(/Inbox clear/).waitFor({ timeout: 60000 }).catch(() => {});
mark("approved");
await sleep(5000);

mark("ledger");
await go("/ledger");
await sleep(5500);
await click(page.getByRole("button", { name: "Hash chain" }), { hold: 4500 });
await click(page.getByRole("button", { name: "Requests" }), { hold: 2000 });

mark("copilot");
await go("/copilot");
await sleep(1500);
mark("copilot ask");
await click(page.getByRole("button", { name: /Refund the most recent grocery purchase/ }), { hold: 300 });
await page.locator("input[placeholder='Ask or instruct…']").waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
await page.waitForFunction(() => !document.querySelector("input[placeholder='Working…']"), null, { timeout: 150000 }).catch(() => {});
mark("copilot done");
await sleep(5000);

mark("architecture card");
await card("arch", 9000);
mark("end card");
await card("end", 7000);
mark("end");

await context.close();
await browser.close();
const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".webm")).map((f) => ({ f, m: fs.statSync(path.join(outDir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
fs.renameSync(path.join(outDir, files[0].f), path.join(outDir, "raw.webm"));
fs.writeFileSync(path.join(outDir, "marks.json"), JSON.stringify(marks, null, 2));
console.log("saved video/raw.webm and video/marks.json");
