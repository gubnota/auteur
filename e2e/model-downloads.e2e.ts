import { test, expect } from "@playwright/test";
import { openFixture, project, settings } from "./fixtures/jobs";

test("HF token settings are masked, explicitly saved and removable without a Movie", async ({
  page,
}) => {
  await openFixture(page, structuredClone(project), settings, {
    globalOnly: true,
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Model downloads", exact: true }).click();
  await expect(
    page.getByText("HF_TOKEN: Not configured", { exact: true }),
  ).toBeVisible();
  const token = page.getByLabel("HF_TOKEN", { exact: true });
  await expect(token).toHaveAttribute("type", "password");
  await token.fill("hf_fixture_private_token");
  await page.getByRole("button", { name: "Save token", exact: true }).click();
  await expect(
    page.getByText("HF_TOKEN: Configured in the system vault", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Replace HF_TOKEN", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await page.getByRole("tab", { name: "Model downloads", exact: true }).click();
  await expect(
    page.getByLabel("Replace HF_TOKEN", { exact: true }),
  ).toHaveValue("");
  await page.screenshot({
    path: "docs/screenshots/model-download-settings-0.1.21.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Remove token", exact: true }).click();
  await expect(
    page.getByText("HF_TOKEN: Not configured", { exact: true }),
  ).toBeVisible();
});

test("workflow authoring exposes dependencies and keeps installation separate from graph publication", async ({
  page,
}) => {
  await openFixture(page, structuredClone(project), settings);
  const count = await page.evaluate(
    () => (window as any).fixture.movie().workflows.length,
  );
  await page
    .getByRole("button", { name: "Install on instance", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Dependencies", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "Set up local agent", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add model / plugin / wheel", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .last()
      .getByLabel("Public HTTPS download URL · no secrets", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  expect(
    await page.evaluate(() => (window as any).fixture.movie().workflows.length),
  ).toBe(count);
  await page.screenshot({
    path: "docs/screenshots/workflow-installation-0.1.21.png",
    fullPage: true,
  });
});
