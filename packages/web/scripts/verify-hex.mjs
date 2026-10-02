import { chromium } from "playwright";

const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const BASE = "http://localhost:5173";

async function signup(page, name, email) {
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText(`Welcome, ${name}`).waitFor({ timeout: 15_000 });
}

const stamp = Date.now();
const browser = await chromium.launchPersistentContext(`/tmp/topper-brave-hex-${stamp}`, {
  executablePath: BRAVE,
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions"],
});
const page = browser.pages()[0] ?? (await browser.newPage());
const notes = [];

try {
  await signup(page, "Hex GM", `hex+${stamp}@table.test`);
  await page.getByLabel("New table").fill("Hex Table");
  await page.getByRole("button", { name: "Host" }).click();
  await page.getByRole("heading", { name: "Hex Table" }).waitFor({ timeout: 15_000 });
  await page.locator(".map-blank").waitFor({ timeout: 10_000 });
  notes.push("hosted blank square map");

  await page.getByRole("button", { name: "Map settings" }).click();
  await page.getByLabel("Grid type").selectOption("hexFlat");
  await page.waitForFunction(() => (document.querySelector("path.map-grid-hex")?.getAttribute("d") ?? "").length > 0);
  notes.push("hex flat grid drawn");

  await page.getByRole("button", { name: "Fill" }).click();
  const map = page.locator(".map-viewport");
  const box = await map.boundingBox();
  if (!box) throw new Error("map missing");
  const x = box.width * 0.42;
  const y = box.height * 0.45;
  await map.hover({ position: { x, y } });
  await page.mouse.down();
  await page.mouse.move(box.x + x + 120, box.y + y + 90, { steps: 10 });
  await page.mouse.up();
  await page.locator("svg.map-drawing.fills polygon").first().waitFor({ timeout: 10_000 });
  const fills = await page.locator("svg.map-drawing.fills polygon").count();
  if (fills < 2) throw new Error(`expected hex fills, got ${fills}`);
  notes.push(`painted ${fills} hex fills`);

  await page.getByRole("button", { name: "Edge" }).click();
  await map.hover({ position: { x: x + 20, y: y + 20 } });
  await page.mouse.down();
  await page.mouse.move(box.x + x + 140, box.y + y + 40, { steps: 8 });
  await page.mouse.up();
  await page.locator("svg.map-drawing.edges line").first().waitFor({ state: "attached", timeout: 10_000 });
  notes.push(`painted ${await page.locator("svg.map-drawing.edges line").count()} hex edges`);

  await page.getByRole("button", { name: "Map settings" }).click();
  await page.getByLabel("Grid type").selectOption("hexPointy");
  await page.waitForFunction(() => (document.querySelector("path.map-grid-hex")?.getAttribute("d") ?? "").length > 0);
  notes.push("switched to hex pointy");

  const sizeInput = page.getByLabel("Grid size");
  await sizeInput.click({ clickCount: 3 });
  const typedAt = Date.now();
  await page.keyboard.type("30", { delay: 120 });
  const midSize = await page.evaluate(() => (document.querySelector("path.map-grid-hex")?.getAttribute("d") ?? "").length);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => {
    const input = [...document.querySelectorAll(".toolbar-setting input[type=number]")][0];
    return input && input.value === "30";
  });
  const elapsed = Date.now() - typedAt;
  if (elapsed > 3000) throw new Error(`grid size typing took ${elapsed}ms`);
  notes.push(`typed grid size 30 without intermediate commits (${elapsed}ms, path ${midSize} chars mid-edit)`);

  await page.getByLabel("Grid type").selectOption("square");
  await page.waitForFunction(
    () =>
      !document.querySelector("path.map-grid-hex") &&
      document.querySelectorAll("svg.map-drawing.grid line").length > 0 &&
      document.querySelectorAll("svg.map-drawing.fills polygon").length === 0,
  );
  notes.push("square restore clears paint");

  console.log(JSON.stringify({ ok: true, notes }, null, 2));
} catch (err) {
  console.error(err);
  console.error(JSON.stringify({ ok: false, notes }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
