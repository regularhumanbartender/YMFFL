import { type Page, expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cycleMetadata } from "../website/src/catalog";
import { legacyScenarioKey, scenarioKey, snapshotSchema } from "../website/src/model";

// Deterministic, explicitly fictional test publications; never exported or copied to public/data.
const fixture = (file: string) =>
  snapshotSchema.parse(
    JSON.parse(readFileSync(new URL(`../website/src/${file}`, import.meta.url), "utf8")),
  );
const old = fixture("demo.fixture.json");
const next = fixture("demo-2027.fixture.json");
const older = { ...cycleMetadata(old), file: "demo-2026.0123456789abcdef0123.json" };
const newer = { ...cycleMetadata(next), file: "demo-2027.0123456789abcdef0123.json" };
const manifest = { schemaVersion: 1, defaultLeagueId: "demo-2027", cycles: [newer, older] };
const mode = (page: Page) => page.getByRole("button", { name: /What-if simulator/ }).click();
const lab = (page: Page) => page.getByRole("button", { name: "Trade lab", exact: true }).click();
const add = (page: Page) => page.getByRole("button", { name: "Add hypothetical trade" }).click();
const selectYear = (page: Page, id: string) =>
  page.getByLabel("Season / keeper cycle").selectOption(id);
const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

test.beforeEach(async ({ page }) => {
  await page.route("**/data/manifest.json", (route) => route.fulfill({ json: manifest }));
  await page.route(`**/data/${older.file}`, (route) => route.fulfill({ json: old }));
  await page.route(`**/data/${newer.file}`, (route) => route.fulfill({ json: next }));
});

test("kept player moves roster and every budget view; published, reload, cycle isolation and reset stay safe", async ({
  page,
}) => {
  const external: string[] = [];
  const writes: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (req) => {
    if (!req.url().startsWith("http://127.0.0.1:4175/")) external.push(req.url());
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method())) writes.push(req.url());
  });
  await page.goto("./");
  await selectYear(page, "demo-2026");
  await mode(page);
  await lab(page);
  await page.getByRole("checkbox", { name: "Team A sends Josh Allen", exact: true }).check();
  await add(page); // blank cash means player-only, not an empty trade
  await expect(
    page.getByRole("checkbox", { name: "Team A sends Josh Allen", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Team B sends Josh Allen", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No auction dollars", { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "Roster", exact: true }).click();
  const budget = page.locator(".metric.featured > strong");
  await expect(budget).toHaveText("$241");
  await expect(page.getByRole("switch", { name: "Remove Josh Allen", exact: true })).toHaveCount(0);
  await page.getByLabel("Select team", { exact: true }).selectOption("team-1");
  await expect(budget).toHaveText("$145");
  await expect(
    page.getByRole("switch", { name: "Remove Josh Allen", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".metric").filter({ hasText: "KEEPER INVESTMENT" })).toContainText(
    "$145",
  );
  await expect(page.locator(".metric").filter({ hasText: "OPEN ROSTER SPOTS" })).toContainText(
    "21",
  );
  await expect(page.locator(".metric").filter({ hasText: "MAXIMUM NEXT BID" })).toContainText(
    "$125",
  );
  await expect(
    page.locator(".panel-heading").filter({ hasText: "Roster & keeper decisions" }),
  ).toContainText("9 players");
  await page.getByRole("switch", { name: "Remove Josh Allen", exact: true }).click();
  await expect(budget).toHaveText("$183");
  await page.getByRole("switch", { name: "Keep Josh Allen", exact: true }).click();
  await page.getByRole("button", { name: "League budgets", exact: true }).click();
  const card = page.locator(".team-card").filter({ hasText: "Sunday Syndicate" });
  await expect(card.locator(".team-money")).toContainText("$145");
  await expect(
    card.locator(".team-stats > div").filter({ hasText: "Roster players" }),
  ).toContainText("9");
  await noOverflow(page);
  await page.getByRole("button", { name: "Published baseline", exact: true }).click();
  await page.getByRole("button", { name: "Roster", exact: true }).click();
  await expect(budget).toHaveText("$183");
  await expect(page.getByRole("switch", { name: "Remove Josh Allen", exact: true })).toHaveCount(0);
  await page.getByLabel("Select team", { exact: true }).selectOption("team-0");
  await expect(budget).toHaveText("$203");
  await expect(page.getByRole("switch", { name: "Remove Josh Allen", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset scenario" })).toBeDisabled();
  await page.reload();
  await selectYear(page, "demo-2026");
  await mode(page);
  await expect(budget).toHaveText("$241");
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    scenarioKey(old),
  );
  expect(saved).toMatchObject({
    version: 2,
    leagueId: "demo-2026",
    trades: [{ fromPlayerIds: ["demo-0-0"], amount: 0 }],
  });
  expect(
    await page.evaluate((key) => localStorage.getItem(key), legacyScenarioKey(old)),
  ).toBeNull();
  await selectYear(page, "demo-2027");
  await expect(
    page.getByRole("button", { name: "Published baseline", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await mode(page);
  await lab(page);
  await expect(page.getByText("No hypothetical trades yet.")).toBeVisible();
  await selectYear(page, "demo-2026");
  await mode(page);
  await expect(budget).toHaveText("$241");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(budget).toHaveText("$203");
  await expect(
    page.getByRole("switch", { name: "Remove Josh Allen", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await selectYear(page, "demo-2026");
  await mode(page);
  await expect(budget).toHaveText("$203");
  expect(external).toEqual([]);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("multi-player packages, reverse cash, current-roster chains and blocked dependency removal", async ({
  page,
}) => {
  await page.goto("./");
  await selectYear(page, "demo-2026");
  await mode(page);
  await lab(page);
  for (const name of ["Josh Allen", "Saquon Barkley", "Bijan Robinson"]) {
    await page.getByRole("checkbox", { name: `Team A sends ${name}`, exact: true }).check();
  }
  for (const name of ["Brock Bowers", "T.J. Watt"]) {
    await page.getByRole("checkbox", { name: `Team B sends ${name}`, exact: true }).check();
  }
  await page.getByLabel("Auction dollars", { exact: true }).fill("10");
  await page.getByLabel("Cash direction", { exact: true }).selectOption("toFrom");
  await add(page);
  const history = page.getByRole("region", { name: "Scenario trade history" });
  await expect(history).toContainText(
    "Fourth & Forever sends: Josh Allen, Saquon Barkley, Bijan Robinson",
  );
  await expect(history).toContainText("Sunday Syndicate sends: Brock Bowers, T.J. Watt");
  await expect(history).toContainText("Cash: Sunday Syndicate → Fourth & Forever");
  await expect(
    page.getByText("$290 remaining · 2 keepers · 7 players", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("$96 remaining · 4 keepers · 9 players", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Team A", { exact: true }).selectOption("team-1");
  await page.getByLabel("Team B", { exact: true }).selectOption("team-2");
  await expect(
    page.getByRole("checkbox", { name: "Team A sends Josh Allen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Team A sends Brock Bowers", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Team A sends Josh Allen", exact: true }).check();
  await add(page);
  const first = page.getByRole("article", { name: "Hypothetical trade 1", exact: true });
  const second = page.getByRole("article", { name: "Hypothetical trade 2", exact: true });
  await first.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Remove dependent later trades first");
  await expect(history.getByRole("article")).toHaveCount(2);
  await noOverflow(page);
  await second.getByRole("button", { name: "Remove", exact: true }).click();
  await first.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("No hypothetical trades yet.")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Team A sends Josh Allen", exact: true }),
  ).toHaveCount(0);
});

test("a new exact baseline does not import an old saved player plan", async ({ page }) => {
  await page.goto("./");
  await mode(page);
  await lab(page);
  await page
    .getByRole("checkbox", { name: "Team A sends Fictional 2027 Player 1", exact: true })
    .check();
  await add(page);
  const updated = {
    ...next,
    snapshotId: "fictional-player-plan-new-baseline",
    capturedAt: "2026-11-25T00:00:00Z",
  };
  const updatedCycle = { ...cycleMetadata(updated), file: "demo-2027.ffffffffffffffffffff.json" };
  await page.route("**/data/manifest.json", (route) =>
    route.fulfill({ json: { ...manifest, cycles: [updatedCycle, older] } }),
  );
  await page.route(`**/data/${updatedCycle.file}`, (route) => route.fulfill({ json: updated }));
  await expect(
    page.getByRole("checkbox", { name: "Team A sends Fictional 2027 Player 1", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Remove Fictional 2027 Player 1", exact: true }),
  ).toBeDisabled();
  await mode(page);
  await lab(page);
  await expect(page.getByText("No hypothetical trades yet.")).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).trades.length,
      scenarioKey(next),
    ),
  ).toBe(1);
});

test("legacy cash plans copy to v2 without data loss; invalid ownership fails whole plan closed", async ({
  page,
}) => {
  const legacy = {
    keepers: {},
    trades: [{ id: "legacy-cash", fromTeamId: "team-0", toTeamId: "team-1", amount: 15 }],
  };
  await page.addInitScript(
    ({ key, raw }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
    },
    { key: legacyScenarioKey(old), raw: JSON.stringify(legacy) },
  );
  await page.goto("./");
  await selectYear(page, "demo-2026");
  const budget = page.locator(".metric.featured > strong");
  await expect(budget).toHaveText("$203");
  await mode(page);
  await expect(budget).toHaveText("$188");
  await lab(page);
  await page.getByRole("checkbox", { name: "Team A sends Josh Allen", exact: true }).check();
  await add(page);
  await page.reload();
  await selectYear(page, "demo-2026");
  await mode(page);
  await expect(budget).toHaveText("$226");
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), legacyScenarioKey(old)),
  ).toEqual(legacy);
  await page.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key)!);
    value.trades[1].fromPlayerIds = ["demo-1-0"]; // known player, wrong owner
    localStorage.setItem(key, JSON.stringify(value));
  }, scenarioKey(old));
  await page.reload();
  await selectYear(page, "demo-2026");
  await expect(page.getByRole("status")).toContainText("No saved trades were applied");
  await mode(page);
  await expect(budget).toHaveText("$203"); // valid old cash is NOT silently substituted
  await lab(page);
  await expect(page.getByText("No hypothetical trades yet.")).toBeVisible();
  await noOverflow(page);
});
