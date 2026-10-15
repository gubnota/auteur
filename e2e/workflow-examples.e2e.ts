import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openFixture, project, settings } from "./fixtures/jobs";
import type { Workflow } from "../apps/desktop/src/lib/types";

function example(): Workflow {
  const w = structuredClone(project.workflows[0]);
  w.id = "example-sd15";
  w.name = "SD 1.5 · T4 starter";
  w.wrapper = {
    familyId: "sd15",
    variantName: "Example v1",
    collection: "Getting started",
    description: "Prompt to image · 512×512 · batch 1",
    readme:
      "## Connect once\nSelect your notebook node. Review exact dependencies before initialization.",
    os: "linux",
    architecture: "any",
    precision: "default",
    exampleId: "sd15-t4",
    illustration: readFileSync(
      "examples/catalogue/sd15-t4.data.txt",
      "utf8",
    ).trim(),
  };
  return w;
}

test("bundled example opens its guide and reuses a single movie copy", async ({
  page,
}) => {
  await openFixture(page, structuredClone(project), settings, {
    catalogue: [example()],
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const section = page.locator(".example-section");
  await expect(section.getByRole("img")).toBeVisible();
  await section
    .getByRole("button", { name: "Use example", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Guide", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Connect once" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    section.getByRole("button", { name: "Open movie copy" }),
  ).toBeVisible();
  await section.getByRole("button", { name: "Open movie copy" }).click();
  const count = await page.evaluate(
    () =>
      (window as any).fixture
        .movie()
        .workflows.filter((w: Workflow) => w.id === "example-sd15").length,
  );
  expect(count).toBe(1);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("heading", { name: "Workflows", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/workflow-examples.png",
    fullPage: true,
  });
});

test("guided setup reviews pins, restarts managed ComfyUI and rechecks the prepared workflow", async ({
  page,
}) => {
  const relay = structuredClone(settings);
  relay.connections = [
    {
      ...relay.connections[0],
      id: "relay",
      kind: "relay",
      name: "Colab T4",
      url: "https://fixture.invalid",
      deploymentId: "gpu0",
    },
  ];
  const artifacts = [
    JSON.parse(readFileSync("examples/catalogue/sd15-model.json", "utf8")),
  ];
  const review = (id: string) => ({
    state: "review",
    reviewId: id,
    managedRuntime: true,
    restartSupported: true,
    profile: { artifacts },
    inventory: {
      files: [
        {
          target: artifacts[0].target,
          state: "missing",
          path:
            "/content/auteur-node/models/checkpoints/" + artifacts[0].target,
        },
      ],
    },
    plan: { ready: false, missingNodes: [], unresolved: [] },
  });
  await openFixture(page, structuredClone(project), relay, {
    catalogue: [example()],
    setupReports: [
      review("review-1"),
      { state: "needs-restart", note: "Dependencies installed and verified." },
      { state: "restarted" },
      review("review-2"),
      { state: "ready", ready: true },
    ],
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .locator(".example-section")
    .getByRole("button", { name: "Use example", exact: true })
    .click();
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  const setup = page.getByRole("region", { name: "Agent initialization" });
  await setup
    .getByRole("button", { name: "Initialize on Colab T4", exact: true })
    .click();
  await expect(
    setup.getByText("CreativeML OpenRAIL-M", { exact: true }),
  ).toBeVisible();
  await expect(setup.getByText(/models\/checkpoints\//)).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).fixture.setupCalls.filter((c: any) => c.apply).length,
    ),
  ).toBe(0);
  await setup
    .getByRole("button", { name: "Install & prepare on Colab T4", exact: true })
    .click();
  await expect(
    setup.getByText("Ready for this session", { exact: true }),
  ).toBeVisible();
  const calls = await page.evaluate(() => (window as any).fixture.setupCalls);
  expect(
    calls.filter((c: any) => c.apply === true).map((c: any) => c.reviewId),
  ).toEqual(["review-1", "review-2"]);
  expect(
    await page.evaluate(() => (window as any).fixture.submissions.length),
  ).toBe(0);
  await setup.getByRole("heading").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/workflow-agent-setup.png",
    fullPage: true,
  });
});

test("the workflow modal installs and prepares on the instance selected inside it", async ({
  page,
}) => {
  const movie = structuredClone(project);
  movie.workflows[0].editorGraph = {
    nodes: [{ id: 1, type: "CLIPTextEncode" }],
  };
  await openFixture(page, movie, settings);
  await page
    .getByRole("button", { name: "Run and install on", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Second node", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Install in ComfyUI", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fixture.installs))
    .toEqual([{ workflowId: "workflow", connectionId: "account-1" }]);
  await page
    .getByRole("button", { name: "Prepare inputs", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fixture.preparations))
    .toEqual([{ workflowId: "workflow", connectionId: "account-1" }]);
  await expect(page.getByText(/Prepared for Second node/)).toBeVisible();
});

test("setup keeps the instance fixed while checking and refuses an unmanaged runtime", async ({
  page,
}) => {
  const relay = structuredClone(settings);
  relay.connections[0] = {
    ...relay.connections[0],
    kind: "relay",
    name: "Colab T4",
    deploymentId: "gpu0",
  };
  await openFixture(page, structuredClone(project), relay, {
    setupReports: [
      { state: "review", reviewId: "external", managedRuntime: false },
    ],
  });
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  await page.evaluate(() => (window as any).fixture.holdSetup(true));
  await page
    .getByRole("button", { name: "Initialize on Colab T4", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Run and install on", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("tab", { name: "Inputs", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => (window as any).fixture.holdSetup(false));
  await expect(
    page.getByRole("button", {
      name: "Install & prepare on Colab T4",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByText(/This runtime is external and read-only/),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).fixture.setupCalls.filter(
        (c: any) => c.apply || c.command === "runner_action",
      ),
    ),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Run and install on", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Second node", exact: false })
    .click();
  await expect(
    page.getByRole("region", { name: "Agent initialization" }),
  ).toHaveCount(0);
});

test("a refused restart stops guided initialization before compilation or generation", async ({
  page,
}) => {
  const relay = structuredClone(settings);
  relay.connections[0] = {
    ...relay.connections[0],
    kind: "relay",
    name: "Colab T4",
  };
  await openFixture(page, structuredClone(project), relay, {
    setupReports: [
      {
        state: "review",
        reviewId: "one",
        managedRuntime: true,
        restartSupported: false,
      },
      { state: "needs-restart", restartRequired: true },
    ],
  });
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  await page
    .getByRole("button", { name: "Initialize on Colab T4", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Install & prepare on Colab T4", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Colab T4: Error: Dependencies are installed",
  );
  expect(
    await page.evaluate(() => (window as any).fixture.preparations),
  ).toEqual([]);
  expect(
    await page.evaluate(() => (window as any).fixture.submissions),
  ).toEqual([]);
});
