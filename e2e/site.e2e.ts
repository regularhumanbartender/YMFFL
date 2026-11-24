import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture: unknown = JSON.parse(
  readFileSync(new URL("../website/src/demo.fixture.json", import.meta.url), "utf8"),
);

// Keep interaction tests deterministic after daily snapshots replace public JSON.
test.beforeEach(async ({ page }) => {
  await page.route("**/data/snapshot.json", (route) => route.fulfill({ json: fixture }));
});

test("anonymous mobile-friendly snapshot and all navigation views", async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (req) => {
    if (!req.url().startsWith("http://127.0.0.1:4175/")) {
      external.push(req.url());
    }
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Build your edge." })).toBeVisible();
  await expect(page.getByText("Preview data.", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Remove Josh Allen" })).toBeDisabled();
  for (const name of ["League budgets", "Trade lab", "Rules", "Roster"]) {
    await page.getByRole("button", { name, exact: true }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("keeper scenario is local, persisted and resettable", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: /What-if simulator/ }).click();
  await expect(page.getByRole("switch", { name: "Keep Puka Nacua" })).toBeDisabled();
  const budget = page.locator(".metric.featured > strong");
  const before = await budget.textContent();
  await page.getByRole("switch", { name: "Remove Josh Allen" }).click();
  await expect(budget).not.toHaveText(before!);
  await page.getByRole("button", { name: "Published baseline", exact: true }).click();
  await expect(budget).toHaveText(before!);
  await page.reload();
  await page.getByRole("button", { name: /What-if simulator/ }).click();
  await expect(page.getByRole("switch", { name: "Keep Josh Allen" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(budget).toHaveText(before!);
  await expect(page.getByRole("switch", { name: "Remove Josh Allen" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
test("trade simulation changes budget without network writes", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (req) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method())) {
      writes.push(req.url());
    }
  });
  await page.goto("./");
  await page.getByRole("button", { name: /What-if simulator/ }).click();
  const budget = page.locator(".metric.featured > strong");
  const before = await budget.textContent();
  await page.getByRole("button", { name: "Trade lab", exact: true }).click();
  await page.getByLabel("Auction dollars", { exact: true }).fill("15");
  await page.getByRole("button", { name: "Add hypothetical trade" }).click();
  await expect(page.getByText("$15 · hypothetical", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Roster", exact: true }).click();
  await expect(budget).not.toHaveText(before!);
  await page.getByRole("button", { name: "Trade lab", exact: true }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByLabel("Receiving team").selectOption("team-0");
  await page.getByLabel("Auction dollars", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Add hypothetical trade" }).click();
  await expect(page.getByRole("alert")).toHaveText("Choose two different teams.");
  expect(writes).toEqual([]);
});
test("bad snapshot fails closed with retry", async ({ page }) => {
  await page.route("**/data/snapshot.json", (route) =>
    route.fulfill({ contentType: "application/json", body: "{}" }),
  );
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Snapshot unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
});
