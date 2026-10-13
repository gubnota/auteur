import { test, expect, type Page } from "@playwright/test";
import { openFixture } from "./fixtures/jobs";

async function chooseFrame(page: Page) {
  await page
    .getByRole("button", { name: "Target keyframe", exact: true })
    .click();
  await page.getByRole("button", { name: "Pilot / Coast / Frame 01" }).click();
  await page.getByRole("button", { name: "Create generation job" }).click();
}

test("imported workflow exposes job creation and explains the missing deployment", async ({
  page,
}) => {
  await openFixture(page);
  await expect(
    page.getByRole("button", { name: "Create generation job" }),
  ).toBeDisabled();
  await chooseFrame(page);
  await expect(
    page.getByText(/Importing JSON alone does not create a hosted deployment/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review exact inputs" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => (window as any).fixture.submissions),
  ).toEqual([]);
});

test("account-specific mapping survives reopening and enables only the mapped account", async ({
  page,
}) => {
  await openFixture(page);
  const account = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: "Studio account" }) });
  await account
    .getByLabel("Workflow / AI App ID", { exact: true })
    .fill("123456789");
  await account.getByRole("button", { name: "RunningHub API family" }).click();
  await page
    .getByRole("button", { name: "Published AI App (v2)", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).fixture.saved?.workflows[0].deployments,
      ),
    )
    .toEqual([
      {
        connectionId: "account-0",
        deploymentId: "123456789",
        apiFamily: "ai-app",
      },
    ]);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: /Imported image workflow/ }).click();
  await expect(
    page.getByLabel("Workflow / AI App ID", { exact: true }).first(),
  ).toHaveValue("123456789");
  await chooseFrame(page);
  const submit = page.getByRole("button", { name: "Review exact inputs" });
  await expect(submit).toBeEnabled();
  await expect(
    page.getByLabel("Hosted deployment ID", { exact: true }),
  ).toHaveValue("123456789");
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  await page.getByRole("button", { name: /Second account runninghub/ }).click();
  await expect(submit).toBeDisabled();
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  await page.getByRole("button", { name: /Studio account runninghub/ }).click();
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: "artifacts/e2e/runninghub-job-review.png" });
  await submit.click();
  await page.getByRole("button", { name: /Validate & start 1 job/ }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fixture.submissions.length))
    .toBe(1);
  const saved = await page.evaluate(() => (window as any).fixture.saved);
  const submission = await page.evaluate(
    () => (window as any).fixture.submissions[0],
  );
  expect(submission.draftId).toBe(saved.jobDrafts[0].id);
  expect(saved.jobDrafts[0].frameId).toBe("frame");
  expect(saved.jobDrafts[0].items[0].connectionId).toBe("account-0");
  expect(saved.workflows[0].deployments[0].deploymentId).toBe("123456789");
});
