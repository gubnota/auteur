import { test, expect } from "@playwright/test";
import { openFixture, project, settings } from "./fixtures/jobs";
import defaults from "../deploy/node-auth.defaults.json" with { type: "json" };

test("saved predefined tokens can be shown and copied and reopen masked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { (window as any).copiedToken = value; } },
    });
  });
  const initial = structuredClone(settings);
  initial.connections = [{
    ...settings.connections[0], id: "default-agent", name: "Default agent", kind: "relay",
    credentialRef: "connection:default-agent:test-default", deploymentId: "test-node",
  }];
  await openFixture(page, project, initial, { globalOnly: true });
  await page.getByRole("button", { name: "Instances", exact: true }).click();
  const card = page.locator("article.connection").filter({ hasText: "Default agent" });
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Connection settings" });
  const token = modal.getByLabel("Replace credential (optional)");
  await expect(token).toHaveAttribute("type", "password");
  expect(await token.evaluate((el: HTMLInputElement, value) => el.value === value, defaults.MYMOVIE_DESKTOP_TOKEN)).toBe(true);
  await modal.getByRole("button", { name: "Show token", exact: true }).click();
  await expect(token).toHaveAttribute("type", "text");
  await modal.getByRole("button", { name: "Copy token", exact: true }).click();
  await expect(modal.getByRole("status")).toHaveText("Token copied.");
  expect(await page.evaluate(value => (window as any).copiedToken === value, defaults.MYMOVIE_DESKTOP_TOKEN)).toBe(true);
  await modal.getByRole("button", { name: "Hide token", exact: true }).click();
  await expect(token).toHaveAttribute("type", "password");
  await modal.getByRole("button", { name: "Show token", exact: true }).click();
  await modal.getByRole("button", { name: "Close dialog", exact: true }).click();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(token).toHaveAttribute("type", "password");
  await token.fill("");
  await expect(modal.getByRole("button", { name: "Show token", exact: true })).toBeDisabled();
  await expect(modal.getByRole("button", { name: "Copy token", exact: true })).toBeDisabled();
  await modal.getByRole("button", { name: "Close dialog", exact: true }).click();
  const stored = await page.evaluate(() => (window as any).fixture.staleSettings());
  expect(stored.connections[0].credentialRef).toBe("connection:default-agent:test-default");
  expect(await page.evaluate(() => (window as any).fixture.credentialWrites ?? [])).toEqual([]);
});

test("all agent presets fill the predefined token and save without typing credentials", async ({ page }) => {
  await openFixture(page, project, settings, { globalOnly: true });
  await page.getByRole("button", { name: "Instances", exact: true }).click();
  for (const preset of ["local-mac", "linux", "orbstack", "runpod", "ssh"]) {
    await page.getByRole("button", { name: "Add connection", exact: true }).click();
    await page.getByRole("button", { name: preset, exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Connection settings" });
    const token = modal.getByLabel("API key / relay token");
    await expect(token).toHaveAttribute("type", "password");
    expect(await token.evaluate((el: HTMLInputElement) => el.value.length >= 24)).toBe(true);
    await modal.getByLabel("Endpoint URL").fill("http://127.0.0.1:8789");
    await modal.getByLabel("Runner node ID").fill("test-node");
    // Clearing the field still selects the default instead of saving a broken connection.
    await token.fill("");
    await modal.getByRole("button", { name: "Save connection", exact: true }).click();
    await expect(modal).not.toBeVisible();
  }
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-settings")!));
  expect(stored.connections.filter((c: { kind: string; credentialRef: string }) => c.kind === "relay" && c.credentialRef).length).toBe(5);
});

test("missing agent credentials inherit defaults while saved credentials and direct connections stay intact", async ({ page }) => {
  const initial = structuredClone(settings);
  initial.connections = [
    { ...settings.connections[0], id: "missing-agent", name: "Missing agent", kind: "relay", credentialRef: null, deploymentId: "test-node" },
    { ...settings.connections[0], id: "private-agent", name: "Private agent", kind: "relay", credentialRef: "connection:private-agent", deploymentId: "test-node" },
  ];
  await openFixture(page, project, initial, { globalOnly: true });
  await page.getByRole("button", { name: "Instances", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Connection settings" });
  await page.locator("article.connection").filter({ hasText: "Missing agent" }).getByRole("button", { name: "Edit", exact: true }).click();
  expect(await modal.getByLabel("API key / relay token").evaluate((el: HTMLInputElement) => el.value.length >= 24)).toBe(true);
  await modal.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.locator("article.connection").filter({ hasText: "Private agent" }).getByRole("button", { name: "Edit", exact: true }).click();
  await expect(modal.getByLabel("Replace credential (optional)")).toHaveValue("");
  await expect(modal.getByRole("button", { name: "Show token", exact: true })).toBeDisabled();
  await modal.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(modal).not.toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-settings")!));
  expect(stored.connections.find((c: { id: string }) => c.id === "private-agent").credentialRef).toBe("connection:private-agent");
  expect(await page.evaluate(() => (window as any).fixture.credentialWrites)).toEqual(["missing-agent"]);
  await page.getByRole("button", { name: "Add connection", exact: true }).click();
  await page.getByRole("button", { name: "Direct ComfyUI", exact: true }).click();
  await expect(modal.getByLabel("API key / relay token")).toHaveValue("");
});

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
    const desktopField = page.locator(".secret-field").filter({ has: desktop });
    await desktopField.getByRole("button", { name: "Show token", exact: true }).click();
    await expect(desktop).toHaveAttribute("type", "text");
    await expect(agent).toHaveAttribute("type", "password");
    await desktopField.getByRole("button", { name: "Hide token", exact: true }).click();
    await expect(desktop).toHaveAttribute("type", "password");
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
      .getByRole("button", { name: "Instances", exact: true })
      .click();
    await page.getByRole("button", { name: "Add connection", exact: true }).click();
    await page.getByRole("button", { name: "local-mac", exact: true }).click();
    const agentModal = page.getByRole("dialog", { name: "Connection settings" });
    expect(await agentModal.getByLabel("API key / relay token").evaluate(
      (el: HTMLInputElement) => el.value === "d".repeat(32),
    )).toBe(true);
    await agentModal.getByRole("button", { name: "Close dialog", exact: true }).click();
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
