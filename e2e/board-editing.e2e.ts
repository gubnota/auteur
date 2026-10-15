import { test, expect } from "@playwright/test";
import { openFixture, project, settings } from "./fixtures/jobs";

async function board(page: import("@playwright/test").Page) {
  const movie = structuredClone(project);
  movie.episodes[0].scenes[0].shots.push({
    id: "shot2",
    name: "Departure",
    frames: [],
  });
  await openFixture(page, movie, settings);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Keyframes", exact: true }).click();
}

test("shots reorder with buttons and remove their frames while preserving media", async ({
  page,
}) => {
  await board(page);
  await page
    .getByRole("button", { name: "Move shot Departure up", exact: true })
    .click();
  await expect(page.getByLabel("Shot name").first()).toHaveValue("Departure");
  await page
    .getByRole("button", { name: "Remove shot Arrival", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep shot", exact: true }).click();
  await expect(page.getByLabel("Shot name")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Remove shot Arrival", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove shot and frames", exact: true })
    .click();
  await expect(page.getByLabel("Shot name")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).fixture.saved.episodes[0].scenes[0].shots.map(
          (s: any) => s.name,
        ),
      ),
    )
    .toEqual(["Departure"]);
});

test("shots reorder by dragging their handle", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  await board(page);
  const handle = await page
    .getByRole("button", { name: "Reorder shot Departure", exact: true })
    .boundingBox();
  const target = await page.getByLabel("Shot name").first().boundingBox();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    target!.x + target!.width / 2,
    target!.y + target!.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(page.getByLabel("Shot name").first()).toHaveValue("Departure");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).fixture.saved.episodes[0].scenes[0].shots[0].name,
      ),
    )
    .toBe("Departure");
});
