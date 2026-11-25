import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cycleMetadata } from "../website/src/catalog";
import { snapshotSchema } from "../website/src/model";

const fixture = (file: string) =>
  snapshotSchema.parse(
    JSON.parse(readFileSync(new URL(`../website/src/${file}`, import.meta.url), "utf8")),
  );
const old = fixture("demo.fixture.json");
// Clearly fictional, test-only 2027 data; never copied into public/data or its manifest.
const next = fixture("demo-2027.fixture.json");
const older = { ...cycleMetadata(old), file: "demo-2026.0123456789abcdef0123.json" };
const newer = { ...cycleMetadata(next), file: "demo-2027.0123456789abcdef0123.json" };
const manifest = { schemaVersion: 1, defaultLeagueId: "demo-2027", cycles: [newer, older] };
test.beforeEach(async ({ page }) => {
  await page.route("**/data/manifest.json", (route) => route.fulfill({ json: manifest }));
  await page.route(`**/data/${older.file}`, (route) => route.fulfill({ json: old }));
  await page.route(`**/data/${newer.file}`, (route) => route.fulfill({ json: next }));
});
test("year switching selects real independent baselines and restores only each cycle's local scenario", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (req) => {
    if (req.method() !== "GET") {
      writes.push(req.url());
    }
  });
  await page.goto("./");
  const picker = page.getByLabel("Season / keeper cycle");
  const budget = page.locator(".metric.featured > strong");
  await expect(picker).toHaveValue("demo-2027");
  await expect(page.getByText("2026 stats → 2027 keepers", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fictional 2027 Team 1" })).toBeVisible();
  const newBudget = await budget.textContent();
  await page.getByRole("button", { name: /What-if simulator/ }).click();
  await page.getByRole("switch", { name: "Remove Fictional 2027 Player 1", exact: true }).click();
  const newScenarioBudget = await budget.textContent();
  expect(newScenarioBudget).not.toBe(newBudget);

  await picker.selectOption("demo-2026");
  await expect(page.getByText("2025 stats → 2026 keepers", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Remove Josh Allen" })).toBeDisabled();
  expect(await budget.textContent()).not.toBe(newBudget);
  await page.getByRole("button", { name: /What-if simulator/ }).click();
  await page.getByRole("switch", { name: "Remove Josh Allen" }).click();
  await page.getByRole("button", { name: "Trade lab", exact: true }).click();
  await page.getByLabel("Auction dollars", { exact: true }).fill("15");
  await page.getByRole("button", { name: "Add hypothetical trade" }).click();
  await expect(page.getByText("$15 · hypothetical", { exact: true })).toBeVisible();

  await picker.selectOption("demo-2027");
  await expect(budget).toHaveText(newBudget!); // Starts read-only, not in another year's simulation.
  await page.getByRole("button", { name: /What-if simulator/ }).click();
  await expect(budget).toHaveText(newScenarioBudget!);
  await page.getByRole("button", { name: "Trade lab", exact: true }).click();
  await expect(page.getByText("No hypothetical trades yet.")).toBeVisible();
  await picker.selectOption("demo-2026");
  await page.getByRole("button", { name: /What-if simulator/ }).click();
  await expect(page.getByRole("switch", { name: "Keep Josh Allen" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.getByRole("button", { name: "Trade lab", exact: true }).click();
  await expect(page.getByText("$15 · hypothetical", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(writes).toEqual([]);
});
test("a broken cycle fails closed and the selector still lets the visitor return to another year", async ({
  page,
}) => {
  await page.route(`**/data/${newer.file}`, (route) => route.fulfill({ json: old }));
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Snapshot unavailable" })).toBeVisible();
  await page.getByLabel("Season / keeper cycle").selectOption("demo-2026");
  await expect(page.getByRole("heading", { name: "Build your edge." })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Remove Josh Allen" })).toBeDisabled();
});

test("a new publication never silently rebases an active or saved scenario", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: /What-if simulator/ }).click();
  await page.getByRole("switch", { name: "Remove Fictional 2027 Player 1", exact: true }).click();
  const scenarioBudget = await page.locator(".metric.featured > strong").textContent();
  const updated = {
    ...next,
    snapshotId: "fictional-demo-2027-v2",
    capturedAt: "2026-11-25T00:00:00Z",
  };
  const updatedCycle = { ...cycleMetadata(updated), file: "demo-2027.ffffffffffffffffffff.json" };
  await page.route("**/data/manifest.json", (route) =>
    route.fulfill({ json: { ...manifest, cycles: [updatedCycle, older] } }),
  );
  await page.route(`**/data/${updatedCycle.file}`, (route) => route.fulfill({ json: updated }));
  // Changing the server-side publication alone does not change this open tab.
  await expect(page.locator(".metric.featured > strong")).toHaveText(scenarioBudget!);
  await expect(
    page.getByRole("switch", { name: "Keep Fictional 2027 Player 1", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Remove Fictional 2027 Player 1", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /What-if simulator/ }).click();
  await expect(
    page.getByRole("switch", { name: "Remove Fictional 2027 Player 1", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) => key.includes("fictional-demo-2027-v1")),
    ),
  ).toBe(true);
});
