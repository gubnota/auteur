import { test, expect } from "@playwright/test";
import { openFixture, project, settings } from "./fixtures/jobs";

test("generation queue and results survive opening and closing a Movie", async ({
  page,
}) => {
  const workspace = structuredClone(project);
  workspace.assets = [
    {
      id: "global-result",
      name: "Global result",
      path: "media/result.png",
      kind: "image",
      sha256: "d".repeat(64),
      size: 1,
    },
  ];
  await openFixture(page, workspace, settings, { globalOnly: true });
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page
    .getByRole("button", { name: "New generation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review exact inputs", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to queue", exact: true })
    .click();
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await page.getByLabel(/^Select run-/).check();
  await page.getByRole("button", { name: "Run selected", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).fixture.jobHistory()[0].state),
    )
    .toBe("submitted");
  await page.getByRole("button", { name: "Open movie", exact: true }).click();
  await page.getByRole("button", { name: "Close movie", exact: true }).click();
  expect(
    await page.evaluate(() => (window as any).fixture.jobHistory()[0].state),
  ).toBe("submitted");
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.setResults([[f.movie().assets[0]]]);
  });
  await page.getByRole("button", { name: "Renders", exact: true }).click();
  await expect(page.locator(".media-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".media-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await page.getByRole("tab", { name: /^Done/ }).click();
  await expect(page.locator(".jobs-task")).toHaveCount(1);
  expect(
    await page.evaluate(() => (window as any).fixture.submissions),
  ).toHaveLength(0);
});
test("zero Movies opens full global shell and inactive Movie workspace", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Workflows", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const tab of [
    "Generate",
    "Jobs",
    "Library",
    "Renders",
    "Instances",
    "Settings",
    "Workflows",
  ]) {
    await page
      .locator(".sidebar nav")
      .getByRole("button", { name: tab, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: tab, exact: true }).first(),
    ).toBeVisible();
  }
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "Characters", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create Movie", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Movie", exact: true }).first(),
  ).toBeVisible();
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "Jobs", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Jobs", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: "docs/screenshots/global-studio-0.1.20.png" });
});
test("global search and instance onboarding work without a Movie", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Search Studio", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "Instances", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Connect an instance" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "local-mac", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
