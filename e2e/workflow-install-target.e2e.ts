import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { openFixture, project, settings } from "./fixtures/jobs";
import type { Workflow } from "../apps/desktop/src/lib/types";

test("direct Apple Silicon FLUX setup explicitly downloads nothing", async ({
  page,
}) => {
  const demos: Workflow[] = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read('collection.json').decode())",
        "examples/flux3/flux3-i2i-2ref.mymovie-workflow",
      ],
      { encoding: "utf8" },
    ),
  ).workflows;
  const workspace = structuredClone(project);
  workspace.workflows = demos;
  await openFixture(page, workspace, settings, {
    catalogue: demos,
    globalOnly: true,
  });
  await page
    .locator(".example-section")
    .getByRole("button", { name: "Use", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Platform variant", exact: true })
    .click();
  await page.getByRole("button", { name: /^Apple Silicon/ }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Direct ComfyUI: graph preparation only" }),
  ).toContainText("3 declared model files");
  await page
    .getByRole("button", { name: "Connect agent to install", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Dependency installation is unavailable" }),
  ).toContainText("No model files will be downloaded here");
  await expect(
    page.getByRole("button", { name: "Set up local agent", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).fixture.setupCalls)).toEqual(
    [],
  );
  await page.screenshot({
    path: "docs/screenshots/workflow-direct-install-0.1.22.png",
    fullPage: true,
  });
});

test("workflow target survives navigation and restart and identifies agent capability", async ({
  page,
}) => {
  const connections = structuredClone(settings);
  connections.connections[1] = {
    ...connections.connections[1],
    name: "Local Mac agent",
    kind: "relay",
    url: "http://127.0.0.1:8789",
    deploymentId: "local-mps-0",
  };
  await openFixture(page, structuredClone(project), connections);
  await page
    .getByRole("button", { name: "Run and install on", exact: true })
    .click();
  await expect(
    page.getByText(
      "Agent · dependency installation · http://127.0.0.1:8789 · local-mps-0",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Local Mac agent" })
    .click();
  await expect(
    page.getByRole("button", { name: "Install on instance", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Preparation target", exact: true }),
  ).toContainText("Local Mac agent");
  await page.reload();
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Preparation target", exact: true }),
  ).toContainText("Local Mac agent");
});

test("removed workflow target requires a deliberate replacement", async ({
  page,
}) => {
  await openFixture(page, structuredClone(project), settings, {
    globalOnly: true,
  });
  await page.evaluate(() =>
    localStorage.setItem("studio.workflowTarget", "removed-instance"),
  );
  await page.reload();
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Preparation target", exact: true }),
  ).not.toContainText("Local ComfyUI");
  await page
    .getByRole("button", { name: /Imported image workflow/ })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Install on instance", exact: true }),
  ).toBeDisabled();
});
