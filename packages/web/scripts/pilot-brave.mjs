import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const BASE = "http://localhost:5173";
const OUT = path.resolve(import.meta.dirname, "../pilot-shots");

await mkdir(OUT, { recursive: true });

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function launch(role, headless, stamp) {
  const x = role === "gm" ? 40 : 720;
  return chromium.launchPersistentContext(`/tmp/topper-brave-${role}-${stamp}`, {
    executablePath: BRAVE,
    headless,
    slowMo: headless ? 0 : 50,
    viewport: { width: 1280, height: 800 },
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      `--window-position=${x},60`,
      "--window-size=1280,800",
    ],
  });
}

async function signup(page, name, email) {
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText(`Welcome, ${name}`).waitFor({ timeout: 15_000 });
}

async function withBrowsers(headless) {
  const stamp = Date.now();
  const gmBrowser = await launch("gm", headless, stamp);
  const playerBrowser = await launch("player", headless, stamp);
  const gm = gmBrowser.pages()[0] ?? (await gmBrowser.newPage());
  const player = playerBrowser.pages()[0] ?? (await playerBrowser.newPage());
  const notes = [];

  try {
    await signup(gm, "GM Gale", `gale+${stamp}@table.test`);
    notes.push("GM signed up and reached the lobby");
    await shot(gm, "01-gm-lobby");

    await gm.getByLabel("New table").fill("The Bronze Bell");
    await gm.getByRole("button", { name: "Host" }).click();
    await gm.getByRole("heading", { name: "The Bronze Bell" }).waitFor({ timeout: 15_000 });
    await gm.getByText(/Invite [A-Z0-9]{8}/).waitFor();
    const inviteText = (await gm.locator(".invite").innerText()).replace(/\s+/g, " ");
    const invite = inviteText.match(/Invite ([A-Z0-9]{8})/)?.[1];
    if (!invite) throw new Error(`Could not read invite code from: ${inviteText}`);
    notes.push(`GM hosted table with invite ${invite}`);
    await shot(gm, "02-gm-table");

    await signup(player, "Player Priya", `priya+${stamp}@table.test`);
    notes.push("Player signed up");
    await player.getByLabel("Invite code").fill(invite);
    await player.getByRole("button", { name: "Join" }).click();
    await player.getByRole("heading", { name: "The Bronze Bell" }).waitFor({ timeout: 15_000 });
    await player.getByText("Player Priya").waitFor();
    await gm.getByText("Player Priya").waitFor();
    notes.push("Player joined; both see each other in People");
    await shot(player, "03-player-joined");

    await gm.getByRole("button", { name: "New character" }).click();
    await gm.getByRole("button", { name: "Unnamed", exact: true }).waitFor();
    await player.getByRole("button", { name: "Unnamed", exact: true }).waitFor();
    await gm.getByRole("button", { name: "Unnamed", exact: true }).click();
    await gm.locator(".sheet-drawer").getByLabel("Name").fill("Branwen");
    await gm.locator(".sheet-drawer .resource-inputs input").first().fill("6");
    await gm.locator(".sheet-drawer").getByRole("heading", { name: "Branwen" }).waitFor();
    await player.getByRole("button", { name: "Branwen", exact: true }).waitFor();
    notes.push("GM created Branwen; HP and name synced to player");
    await shot(gm, "04-gm-sheet");
    await shot(player, "05-player-sees-branwen");

    await gm.getByRole("button", { name: "Place token" }).click();
    const map = gm.locator(".map-viewport");
    const box = await map.boundingBox();
    if (!box) throw new Error("Map viewport missing");
    await map.click({ position: { x: Math.min(240, box.width * 0.35), y: Math.min(260, box.height * 0.45) } });
    await gm.locator(".token").first().waitFor();
    await player.locator(".token").first().waitFor();
    notes.push("GM placed a token; player sees it");

    await gm.locator(".token").first().click();
    await gm.getByRole("heading", { name: "Selected token" }).waitFor();
    await gm.getByLabel("Linked sheet").selectOption({ label: "Branwen" });
    notes.push("Token linked to Branwen");
    await shot(gm, "06-gm-token-linked");

    const token = player.locator(".token").first();
    const before = await token.boundingBox();
    if (!before) throw new Error("Player token missing");
    await token.hover();
    await player.mouse.down();
    await player.mouse.move(before.x + 140, before.y + 80, { steps: 8 });
    await player.mouse.up();
    await gm.locator(".token").first().waitFor();
    notes.push("Player dragged the token; GM still has it on the map");
    await shot(gm, "07-gm-after-drag");
    await shot(player, "08-player-after-drag");

    await player.getByRole("button", { name: "New character" }).click();
    await player.getByRole("button", { name: "Unnamed", exact: true }).click();
    await player.locator(".sheet-drawer").getByLabel("Name").fill("Priya");
    await player.locator(".sheet-drawer .resource-inputs input").first().fill("9");
    await gm.getByRole("button", { name: "Priya", exact: true }).waitFor();
    notes.push("Player sheet Priya appeared on GM sidebar");

    await player.locator(".dice-form input").fill("d20+4");
    await player.getByRole("button", { name: "Roll" }).click();
    await gm.locator(".log-row").filter({ hasText: "d20+4" }).waitFor();
    await player.locator(".log-row").filter({ hasText: "d20+4" }).waitFor();
    notes.push("Player rolled d20+4; both logs show it");
    await shot(gm, "09-gm-dice");
    await shot(player, "10-player-final");

    await gm.reload();
    await gm.getByRole("button", { name: "Branwen", exact: true }).waitFor({ timeout: 15_000 });
    await gm.getByRole("button", { name: "Priya", exact: true }).waitFor();
    await gm.locator(".token").first().waitFor();
    await gm.locator(".log-row").filter({ hasText: "d20+4" }).waitFor();
    notes.push("GM refresh restored characters, token, and dice log");
    await shot(gm, "11-gm-refresh");

    return notes;
  } catch (err) {
    await shot(gm, "fail-gm").catch(() => undefined);
    await shot(player, "fail-player").catch(() => undefined);
    await writeFile(path.join(OUT, "fail-gm.html"), await gm.content().catch(() => ""));
    await writeFile(path.join(OUT, "fail-player.html"), await player.content().catch(() => ""));
    throw err;
  } finally {
    await gmBrowser.close();
    await playerBrowser.close();
  }
}

let notes;
try {
  notes = await withBrowsers(false);
} catch (err) {
  console.warn("Headed Brave failed, retrying headless:", err instanceof Error ? err.message : err);
  notes = await withBrowsers(true);
}

console.log(JSON.stringify({ ok: true, notes, shots: OUT }, null, 2));
