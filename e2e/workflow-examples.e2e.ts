import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { openFixture, project, settings } from "./fixtures/jobs";
import type { Workflow } from "../apps/desktop/src/lib/types";

test("FLUX packages display two families with hardware variants and reference previews", async ({
  page,
}) => {
  const demos: Workflow[] = ["flux3-t2i", "flux3-i2i-2ref"].flatMap(
    (name) =>
      JSON.parse(
        execFileSync(
          "python3",
          [
            "-c",
            "import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read('collection.json').decode())",
            `examples/flux3/${name}.mymovie-workflow`,
          ],
          { encoding: "utf8" },
        ),
      ).workflows,
  );
  const workspace = structuredClone(project);
  workspace.workflows = demos;
  await openFixture(page, workspace, settings, {
    catalogue: demos,
    globalOnly: true,
  });
  const examples = page.locator(".example-section");
  await expect(examples.locator(".workflow-card")).toHaveCount(2);
  await page.screenshot({
    path: "docs/screenshots/flux3-families-0.1.20.png",
    fullPage: true,
  });
  await examples
    .locator(".workflow-card")
    .filter({ hasText: "Two-reference image" })
    .getByRole("button", { name: "Use", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Subject / identity reference",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Style / palette reference", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Platform variant", exact: true })
    .click();
  await page.getByRole("button", { name: /^Apple Silicon/ }).click();
  await expect(
    page.getByRole("button", { name: "Platform variant", exact: true }),
  ).toContainText("Apple Silicon");
  await expect(page.getByLabel("Workflow name", { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: "docs/screenshots/flux3-references-0.1.20.png",
    fullPage: true,
  });
});

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

test("bundled example keeps Use and opens an immutable global definition", async ({
  page,
}) => {
  await openFixture(page, structuredClone(project), settings, {
    catalogue: [example()],
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const section = page.locator(".example-section");
  await expect(section.getByRole("img")).toBeVisible();
  await section.getByRole("button", { name: "Use", exact: true }).click();
  await expect(page.getByLabel("Workflow name", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "Connect once" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(section.getByRole("button", { name: "Use" })).toBeVisible();
  await section.getByRole("button", { name: "Use" }).click();
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

test("guided setup hands ownership to the agent and cancellation survives closing its window", async ({
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
    .getByRole("button", { name: "Use", exact: true })
    .click();
  await page.getByRole("button", { name: "Install on instance", exact: true }).click();
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
  const activity = page.getByRole("dialog").last();
  await expect(
    activity.getByRole("heading", { name: "Background activity" }),
  ).toBeVisible();
  await expect(activity.getByRole("status")).toContainText("Downloading sd15");
  const calls = await page.evaluate(() => (window as any).fixture.setupCalls);
  expect(calls.map((c: any) => c.command)).toEqual([
    "plan_deployment",
    "start_initialization",
  ]);
  expect(
    await page.evaluate(() => (window as any).fixture.submissions.length),
  ).toBe(0);
  await activity.getByText("Steps & logs").click();
  await page.screenshot({
    path: "docs/screenshots/workflow-background-activity.png",
    fullPage: true,
  });
  await activity
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open background activity" }).click();
  await page
    .getByRole("button", { name: "Cancel initialization", exact: true })
    .click();
  await expect(page.getByText("canceled", { exact: true })).toBeVisible();
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
    .getByRole("button", { name: "Publish graph only", exact: true })
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
  await page.getByRole("tab", { name: "Dependencies", exact: true }).click();
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

test("agent initialization failures remain visible without starting generation", async ({
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
  await page.getByRole("tab", { name: "Dependencies", exact: true }).click();
  await page
    .getByRole("button", { name: "Initialize on Colab T4", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Install & prepare on Colab T4", exact: true })
    .click();
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.setInitializations(
      f.initializations().map((r: any) => ({
        ...r,
        state: "failed",
        error: "Managed restart unavailable",
      })),
    );
  });
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Managed restart unavailable",
  );
  expect(
    await page.evaluate(() => (window as any).fixture.preparations),
  ).toEqual([]);
  expect(
    await page.evaluate(() => (window as any).fixture.submissions),
  ).toEqual([]);
});

test("workflow Trash restores the same copy with its form intact", async ({
  page,
}) => {
  await openFixture(page, structuredClone(project), settings);
  const name = project.workflows[0].name;
  await page
    .getByRole("button", { name: "Move workflow to Trash", exact: true })
    .click();
  await page.getByRole("button", { name: "Trash · 1", exact: true }).click();
  await page
    .locator(".asset-grid")
    .getByRole("button")
    .filter({ hasText: name })
    .click();
  await expect(
    page.getByRole("button", { name: "Create a job", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Restore workflow", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as any).fixture.movie().workflows[0].wrapper.archivedAt,
    ),
  ).toBeUndefined();
  expect(
    await page.evaluate(
      () => (window as any).fixture.movie().workflows[0].bindings,
    ),
  ).toEqual(project.workflows[0].bindings);
});

test("clearing workflow trash leaves active workflows available", async ({
  page,
}) => {
  const movie = structuredClone(project);
  const active = structuredClone(movie.workflows[0]);
  active.id = "keep-active";
  active.name = "Keep active";
  movie.workflows.push(active);
  await openFixture(page, movie, settings);
  await page
    .getByRole("button", { name: "Move workflow to Trash", exact: true })
    .click();
  await page.getByRole("button", { name: "Trash · 1", exact: true }).click();
  await page.getByRole("button", { name: "Clear trash", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Clear trash", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      (window as any).fixture.movie().workflows.map((w: Workflow) => w.id),
    ),
  ).toEqual(["keep-active"]);
  await page
    .getByRole("button", { name: "Back to workflows", exact: true })
    .click();
  await expect(
    page.locator(".asset-grid").getByText("Keep active", { exact: true }),
  ).toBeVisible();
});

test("remote console fills the app window on smaller screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  const relay = structuredClone(settings);
  relay.connections = [
    {
      ...relay.connections[0],
      id: "relay",
      kind: "relay",
      name: "CPU notebook",
      url: "https://fixture.invalid",
      deploymentId: "cpu0",
    },
  ];
  await openFixture(page, structuredClone(project), relay);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open background activity" }).click();
  await page
    .getByRole("button", { name: "Open remote console", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "CPU notebook", exact: true })
    .click();
  const console = page.getByRole("dialog").last();
  await expect(console.locator(".xterm-screen")).toBeVisible();
  const bounds = await console.boundingBox();
  expect(bounds).toEqual({ x: 0, y: 0, width: 1024, height: 700 });
  await expect(
    console.getByRole("button", { name: "End session", exact: true }),
  ).toBeInViewport();
  await expect(console.locator(".xterm-screen")).toBeInViewport();
  expect(
    (await console.getByLabel("Interactive remote terminal").boundingBox())!
      .height,
  ).toBeGreaterThan(200);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).fixture.consoleCommands.filter(
            (c: any) => c?.type === "resize",
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  const previous = await page.evaluate(() =>
    (window as any).fixture.consoleCommands
      .filter((c: any) => c?.type === "resize")
      .at(-1),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).fixture.consoleCommands
            .filter((c: any) => c?.type === "resize")
            .at(-1).cols,
      ),
    )
    .toBeGreaterThan(previous.cols);
  expect(
    (await console.getByLabel("Interactive remote terminal").boundingBox())!
      .height,
  ).toBeGreaterThan(650);
  await console
    .getByRole("button", { name: "Full screen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fixtureFullscreen))
    .toBe(true);
  await expect(
    console.getByRole("button", { name: "Exit full screen", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/remote-console-fullscreen.png",
  });
  await console
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fixtureFullscreen))
    .toBe(false);
});

test("custom recipe steps can be saved, reordered and removed", async ({
  page,
}) => {
  await openFixture(page, structuredClone(project), settings);
  await page.getByRole("tab", { name: "Dependencies", exact: true }).click();
  for (const name of ["Prepare folders", "Check extras"]) {
    await page
      .getByRole("button", { name: "Add script step", exact: true })
      .click();
    const modal = page.getByRole("dialog").last();
    await modal.getByLabel("Step name", { exact: true }).fill(name);
    await modal
      .getByLabel("Install script", { exact: true })
      .fill("test -d models");
    await modal.getByRole("button", { name: "Save step", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Move Check extras up", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).fixture
          .movie()
          .workflows[0].wrapper.initialization.map((s: any) => s.name),
      ),
    )
    .toEqual(["Check extras", "Prepare folders"]);
  await page
    .locator(".initialization-recipe li")
    .first()
    .getByRole("button", { name: "Remove step", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).fixture.movie().workflows[0].wrapper.initialization
            .length,
      ),
    )
    .toBe(1);
  await page.screenshot({
    path: "docs/screenshots/workflow-recipe.png",
    fullPage: true,
  });
});

test("trashed example restores immediately and selects another instance for local setup", async ({
  page,
}) => {
  const movie = structuredClone(project),
    w = example();
  w.wrapper!.archivedAt = "2026-10-15";
  movie.workflows.push(structuredClone(w));
  await openFixture(page, movie, settings, { catalogue: [example()] });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Use", exact: true }).click();
  await page
    .getByRole("button", { name: "Run and install on", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Second node" })
    .click();
  await page.getByRole("button", { name: "Install on instance", exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare workflow on Second node", exact: true })
    .click();
  await expect(
    page.getByText(
      "Workflow prepared. Select this instance in Generate to queue a job.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).fixture.preparations.at(-1).connectionId,
    ),
  ).toBe("account-1");
  await page
    .getByRole("button", { name: "Move workflow to Trash", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Use", exact: true }),
  ).toBeVisible();
});
