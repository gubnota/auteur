import { test, expect } from "@playwright/test";
import { openFixture } from "./fixtures/jobs";

for (const [suffix, label] of [
  ["gpu0", "GPU 0"],
  ["cpu0", "CPU"],
]) {
  test(`node tokens authenticate a temporary ${label} notebook connection`, async ({
    page,
  }) => {
    await openFixture(page);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Node access" }).click();
    await expect(
      page.getByRole("tab", { name: "Node access" }),
    ).toHaveAttribute("aria-selected", "true");
    const agent = page.getByLabel("MYMOVIE_AGENT_TOKEN · agent → relay");
    const desktop = page.getByLabel("MYMOVIE_DESKTOP_TOKEN · app → relay");
    await expect(agent).toHaveAttribute("type", "password");
    await expect(desktop).toHaveAttribute("type", "password");
    // Assert population without emitting the token values in test reports.
    expect(
      await agent.evaluate((el: HTMLInputElement) => el.value.length >= 24),
    ).toBe(true);
    expect(
      await desktop.evaluate((el: HTMLInputElement) => el.value.length >= 24),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/e2e/node-access.png",
      fullPage: true,
      animations: "disabled",
    });
    await agent.fill("a".repeat(32));
    await desktop.fill("a".repeat(32));
    await expect(
      page.getByRole("button", { name: "Save node tokens" }),
    ).toBeDisabled();
    await desktop.fill("d".repeat(32));
    await page.getByRole("button", { name: "Save node tokens" }).click();
    await expect(page.getByText(/^Node tokens saved\./).first()).toBeVisible();
    await page.getByRole("tab", { name: "General", exact: true }).click();
    await page.getByRole("tab", { name: "Node access" }).click();
    expect(
      await desktop.evaluate(
        (el: HTMLInputElement) => el.value === "d".repeat(32),
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await page.getByRole("button", { name: "Colab / Kaggle" }).click();
    const modal = page.getByRole("dialog", { name: "Connect notebook nodes" });
    expect(
      await modal
        .getByLabel("MYMOVIE_DESKTOP_TOKEN · app → relay")
        .evaluate((el: HTMLInputElement) => el.value === "d".repeat(32)),
    ).toBe(true);
    await modal
      .getByLabel("Authenticated HTTPS relay")
      .fill("https://fixture.trycloudflare.com");
    await modal
      .getByLabel("Notebook node ID")
      .fill(`notebook-fixture-${suffix}`);
    await modal
      .getByRole("button", { name: "Add notebook connections" })
      .click();
    await expect(
      page.getByText(/Enable temporary Cloudflare polling mode/).first(),
    ).toBeVisible();
    await modal
      .getByRole("checkbox", {
        name: "Temporary Cloudflare tunnel · polling only",
      })
      .click();
    await modal
      .getByRole("button", { name: "Add notebook connections" })
      .click();
    await expect(modal).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: `Colab · ${label}` }),
    ).toBeVisible();
    const settings = await page.evaluate(
      () => sessionStorage.getItem("fixture-settings") ?? "",
    );
    expect(settings.includes("a".repeat(32))).toBe(false);
    expect(settings.includes("d".repeat(32))).toBe(false);
  });
}
