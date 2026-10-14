import { test, expect } from "@playwright/test";
import { openFixture, project, settings } from "./fixtures/jobs";

test("small welcome scrolls and clears history while a movie remains reopenable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 640 });
  await openFixture(page);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to welcome", exact: true })
    .click();
  const list = page.locator(".recent-scroll");
  expect(await list.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(
    true,
  );
  await page
    .getByRole("button", {
      name: "Remove Recent movie 0 from recent movies",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Remove Recent movie 0 from recent movies",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear list", exact: true }).click();
  await expect(list).toHaveCount(0);
  await page.screenshot({
    path: "docs/screenshots/welcome-small.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Open a movie/ }).click();
  await expect(
    page.getByRole("button", { name: "Back to welcome", exact: true }),
  ).toBeVisible();
});

test("library truncates names, requests posters, and navigates inherited character usage", async ({
  page,
}) => {
  const p = structuredClone(project);
  const long = "Red-haired_woman_sweeping_table_2K_20261014012404.jpg";
  p.assets = [
    {
      id: "ref",
      name: long,
      kind: "image",
      path: "media/ref.jpg",
      sha256: "a".repeat(64),
      size: 10,
    },
    {
      id: "video",
      name: "Test clip",
      kind: "video",
      path: "media/test.mp4",
      sha256: "b".repeat(64),
      size: 10,
    },
  ];
  p.characters = [
    {
      id: "actor",
      name: "Jane",
      description: "Scene cast",
      assetIds: ["ref"],
      revision: 0,
    },
  ];
  p.episodes[0].scenes[0].characterIds = ["actor"];
  await openFixture(page, p, settings);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  const name = page.locator(".asset-name", { hasText: long });
  expect(await name.evaluate((e) => getComputedStyle(e).textOverflow)).toBe(
    "ellipsis",
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).fixture.thumbnails.length))
    .toBeGreaterThan(0);
  await expect(page.locator("video")).toHaveAttribute(
    "poster",
    "/fixture-poster.jpg",
  );
  await page
    .getByRole("button", { name: /Usage.*1/, exact: false })
    .first()
    .click();
  await expect(
    page.getByText("Character reference available", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Pilot \/ Coast \/ Arrival \/ Frame 01/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Frame name", exact: true }),
  ).toHaveValue("Frame 01");
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await page.getByRole("button", { name: /Jane.*1 keyframes/ }).click();
  await page
    .getByRole("button", {
      name: "Filter keyframes for this character",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Clear character filter", exact: true }),
  ).toBeVisible();
});

test("renders share library identity, bulk trash retains receipts and restore survives reopening", async ({
  page,
}) => {
  const movie = structuredClone(project);
  movie.assets = ["Original", "Rendered"].map((name, i) => ({
    id: `asset-${i}`,
    name,
    kind: "image",
    path: `media/${i}.png`,
    sha256: String(i).repeat(64),
    size: 10,
  }));
  movie.episodes[0].scenes[0].shots[0].frames[0].assetId = "asset-0";
  movie.workflows[0].deployments = [
    {
      connectionId: "account-0",
      deploymentId: "2110376761482002434",
      apiFamily: "workflow",
    },
  ];
  await openFixture(page, movie, settings);
  await page
    .getByRole("button", { name: "Create generation job", exact: true })
    .click();
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.setResults([[f.saved.assets[1]]]);
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("button", { name: "Renders", exact: true }).click();
  await expect(page.locator(".media-card")).toHaveCount(1);
  await expect(page.locator(".media-card .badge")).toContainText("Render");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.locator(".media-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Select all visible", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove selected · 2", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("1 frames");
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await expect(page.locator(".media-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Renders", exact: true }).click();
  await expect(page.locator(".media-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Welcome", exact: true }).click();
  await page.getByRole("button", { name: /Open a movie/ }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.locator(".media-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Select all visible", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore selected · 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to media", exact: true })
    .click();
  await expect(page.locator(".media-card")).toHaveCount(2);
  const saved = await page.evaluate(() => (window as any).fixture.saved);
  expect(saved.assets.map((a: any) => a.id)).toEqual(["asset-0", "asset-1"]);
  expect(saved.episodes[0].scenes[0].shots[0].frames[0].assetId).toBe(
    "asset-0",
  );
  expect(
    await page.evaluate(
      () => (window as any).fixture.jobHistory()[0].results[0].id,
    ),
  ).toBe("asset-1");
});
