import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import zlib from "node:zlib";

const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const BASE = "http://localhost:5173";
const OUT = path.resolve(import.meta.dirname, "../pilot-shots");

await mkdir(OUT, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Checkerboard PNG: 10×8 cells of 40px → 400×320 */
function makeGridPng(cell = 40, cols = 10, rows = 8) {
  const width = cols * cell;
  const height = rows * cell;
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const light = (cx + cy) % 2 === 0;
      const i = row + 1 + x * 3;
      raw[i] = light ? 210 : 60;
      raw[i + 1] = light ? 177 : 40;
      raw[i + 2] = light ? 122 : 30;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

async function signup(page, name, email) {
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText(`Welcome, ${name}`).waitFor({ timeout: 15_000 });
}

async function readAlignFields(page) {
  return page.locator(".map-align").evaluate((root) => {
    const inputs = [...root.querySelectorAll("input[type=number]")];
    return {
      gridSize: Number(inputs[0]?.value),
      offsetX: Number(inputs[1]?.value),
      offsetY: Number(inputs[2]?.value),
      counts: root.querySelector(".map-align-head span")?.textContent?.trim() ?? "",
    };
  });
}

async function gridStep(page) {
  return page.evaluate(() => {
    const vertical = [...document.querySelectorAll("svg.map-drawing.grid line")].filter(
      (el) => el.getAttribute("x1") === el.getAttribute("x2"),
    );
    const xs = [...new Set(vertical.map((el) => Number(el.getAttribute("x1"))))].sort((a, b) => a - b);
    return xs.length >= 2 ? xs[1] - xs[0] : null;
  });
}

const stamp = Date.now();
const browser = await chromium.launchPersistentContext(`/tmp/topper-brave-align-${stamp}`, {
  executablePath: BRAVE,
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions"],
});
const page = browser.pages()[0] ?? (await browser.newPage());
const notes = [];

try {
  await signup(page, "Align GM", `align+${stamp}@table.test`);
  await page.getByLabel("New table").fill("Align Test");
  await page.getByRole("button", { name: "Host" }).click();
  await page.getByRole("heading", { name: "Align Test" }).waitFor({ timeout: 15_000 });
  notes.push("hosted table");

  await page.locator(".map-blank").waitFor({ timeout: 10_000 });
  if ((await page.locator(".map-drop-card").count()) > 0) {
    throw new Error("Empty map should not require a background upload");
  }
  notes.push("blank grid usable without background");
  await shot(page, "align-01-empty");

  const png = makeGridPng(40, 10, 8);
  const pngPath = path.join(OUT, "align-fixture.png");
  await writeFile(pngPath, png);

  await page.getByRole("button", { name: "Map settings" }).click();
  await page.locator('.toolbar-popover input[type="file"]').setInputFiles(pngPath);
  await page.getByRole("dialog", { name: "Align grid" }).waitFor({ timeout: 15_000 });
  await page.locator("img.map-image").waitFor({ timeout: 15_000 });
  await page.locator("svg.map-drawing.grid.is-aligning").waitFor({ timeout: 10_000 });
  notes.push("upload entered align mode");
  await shot(page, "align-02-uploaded");

  const before = await readAlignFields(page);
  const map = page.locator(".map-viewport");
  const box = await map.boundingBox();
  if (!box) throw new Error("map viewport missing");

  // Drag one 40px cell in screen space; world coords depend on zoom/pan,
  // so we drag a generous square and assert the resulting grid size is near 40.
  const start = { x: box.width * 0.28, y: box.height * 0.28 };
  await map.hover({ position: start });
  await page.mouse.down();
  await page.mouse.move(box.x + start.x + 72, box.y + start.y + 72, { steps: 12 });
  await page.locator(".map-align-square").waitFor({ timeout: 5_000 });
  await page.mouse.up();

  await page.waitForFunction(() => {
    const live = document.querySelector(".map-align.is-live");
    return !live;
  });

  const after = await readAlignFields(page);
  if (after.gridSize === before.gridSize && after.offsetX === before.offsetX) {
    throw new Error(`align drag did not change grid: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  }
  const step = await gridStep(page);
  if (!step || Math.abs(step - after.gridSize) > 0.5) {
    throw new Error(`grid step ${step} does not match size ${after.gridSize}`);
  }
  notes.push(`square drag set grid ${after.gridSize} at ${after.offsetX},${after.offsetY} (${after.counts})`);
  await shot(page, "align-03-squared");

  await page.getByLabel("Size").fill("40");
  await page.getByLabel("Size").press("Enter");
  await page.waitForFunction(() => {
    const input = document.querySelector(".map-align input[type=number]");
    return input && Number(input.value) === 40;
  });
  notes.push("manual size field works");

  const beforeNudge = await readAlignFields(page);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  // Click non-interactive HUD chrome (not the map — that starts an align drag).
  await page.locator(".map-align-head p").click();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    (x) => Number(document.querySelectorAll(".map-align input[type=number]")[1]?.value) === x + 1,
    beforeNudge.offsetX,
  );
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    (x) => Number(document.querySelectorAll(".map-align input[type=number]")[1]?.value) === x + 2,
    beforeNudge.offsetX,
  );
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(
    ({ x, y }) => {
      const inputs = [...document.querySelectorAll(".map-align input[type=number]")];
      return Number(inputs[1]?.value) === x + 2 && Number(inputs[2]?.value) === y + 1;
    },
    { x: beforeNudge.offsetX, y: beforeNudge.offsetY },
  );
  const nudged = await readAlignFields(page);
  notes.push(`arrow nudge → offset ${nudged.offsetX},${nudged.offsetY}`);

  await page.getByRole("button", { name: "Done" }).click();
  await page.locator(".map-align").waitFor({ state: "detached", timeout: 5_000 });
  await page.locator("svg.map-drawing.grid.is-aligning").waitFor({ state: "detached", timeout: 5_000 });
  notes.push("done exits align mode");

  await page.getByRole("button", { name: "Map settings" }).click();
  await page.getByRole("button", { name: "Align grid" }).click();
  await page.getByRole("dialog", { name: "Align grid" }).waitFor({ timeout: 5_000 });
  notes.push("toolbar can re-enter align");
  await page.keyboard.press("Escape");
  await page.locator(".map-align").waitFor({ state: "detached", timeout: 5_000 });
  notes.push("escape exits align");
  await shot(page, "align-04-done");

  console.log(JSON.stringify({ ok: true, notes }, null, 2));
} catch (err) {
  await shot(page, "align-fail").catch(() => {});
  await writeFile(path.join(OUT, "align-fail.html"), await page.content().catch(() => ""));
  console.error(err);
  console.error(JSON.stringify({ ok: false, notes }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
