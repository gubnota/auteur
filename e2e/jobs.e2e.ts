import { test, expect } from "@playwright/test";
import { openFixture, project, settings } from "./fixtures/jobs";

function movie() {
  const p = structuredClone(project);
  p.workflows[0].graph["2"] = {
    class_type: "ExactInputs",
    inputs: {
      seed: 42,
      enabled: true,
      config: '{"quality":"default"}',
      link: ["1", 0],
    },
  };
  p.workflows[0].bindings.push(
    { semantic: "seed", nodeId: "2", input: "seed", valueType: "number" },
    {
      semantic: "enabled",
      nodeId: "2",
      input: "enabled",
      valueType: "boolean",
    },
    { semantic: "config", nodeId: "2", input: "config", valueType: "json" },
  );
  return p;
}
const local = structuredClone(settings);
local.connections = [8188, 8189].map((port, i) => ({
  id: `instance-${i}`,
  name: `ComfyUI ${i + 1}`,
  kind: "comfyui",
  url: `http://127.0.0.1:${port}`,
  concurrency: 1,
}));

test("queued batches stay idle across reopening until explicitly started", async ({
  page,
}) => {
  await openFixture(page, movie(), local);
  await page
    .getByRole("button", { name: "Target keyframe", exact: true })
    .click();
  await page.getByRole("button", { name: "Pilot / Coast / Frame 01" }).click();
  await page.getByRole("button", { name: "Create generation job" }).click();
  await page.getByRole("button", { name: "Review exact inputs" }).click();
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run queued batch", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).fixture.submissions),
  ).toEqual([]);
  await page.getByRole("button", { name: "Welcome", exact: true }).click();
  await page.getByRole("button", { name: /Open a movie/ }).click();
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  expect(
    await page.evaluate(() => (window as any).fixture.submissions),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Run all queued", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fixture.submissions.length))
    .toBe(1);
  await expect(
    page.getByRole("button", { name: "Run all queued", exact: true }),
  ).toHaveCount(0);
});

test("exact empty prompt, zero, false and parsed JSON survive batch duplication", async ({
  page,
}) => {
  await openFixture(page, movie(), local);
  await page
    .getByRole("button", { name: "Target keyframe", exact: true })
    .click();
  await page.getByRole("button", { name: "Pilot / Coast / Frame 01" }).click();
  await page.getByRole("button", { name: "Create generation job" }).click();
  await page
    .getByLabel("Use composed project / scene / keyframe prompt")
    .uncheck();
  await page
    .getByRole("textbox", { name: "positivePrompt · 1.text", exact: true })
    .fill("");
  await page.getByLabel("seed · 2.seed", { exact: true }).fill("0");
  await page.getByLabel("enabled", { exact: true }).uncheck();
  await page
    .getByRole("textbox", { name: "config · 2.config", exact: true })
    .fill('{"quality":"fast","steps":1}');
  await page
    .getByRole("button", { name: "Duplicate item", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Execution node", exact: true })
    .click();
  await page.getByRole("button", { name: /ComfyUI 2 comfyui/ }).click();
  await page.getByRole("button", { name: "Review exact inputs" }).click();
  await page.getByRole("button", { name: /Run now.*2 jobs/ }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fixture.submissions.length))
    .toBe(1);
  const saved = await page.evaluate(() => (window as any).fixture.saved);
  const items = saved.jobDrafts[0].items;
  expect(items.map((i: any) => i.connectionId)).toEqual([
    "instance-0",
    "instance-1",
  ]);
  expect(items[0].id).not.toBe(items[1].id);
  for (const item of items)
    expect(item.values).toEqual({
      positivePrompt: "",
      seed: 0,
      enabled: false,
      config: { quality: "fast", steps: 1 },
    });
  expect(saved.workflows[0].graph["2"].inputs.seed).toBe(42);
  expect(saved.workflows[0].graph["1"].inputs.text).toBe("original prompt");
});

test("invalid raw inputs persist through item switching and reopening and block starting", async ({
  page,
}) => {
  await openFixture(page, movie(), local);
  await page
    .getByRole("button", { name: "Target keyframe", exact: true })
    .click();
  await page.getByRole("button", { name: "Pilot / Coast / Frame 01" }).click();
  await page.getByRole("button", { name: "Create generation job" }).click();
  await page
    .getByLabel("seed · 2.seed", { exact: true })
    .fill("invalid-number");
  await page
    .getByRole("textbox", { name: "config · 2.config", exact: true })
    .fill("{bad-json");
  await expect(
    page.getByRole("button", { name: "Review exact inputs" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Duplicate item", exact: true })
    .click();
  await page
    .getByRole("button", { name: "1. Imported image workflow", exact: true })
    .click();
  await expect(page.getByLabel("seed · 2.seed", { exact: true })).toHaveValue(
    "invalid-number",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(
            (window as any).fixture.saved?.jobDrafts[0].items[0].inputErrors ??
              {},
          ).length,
      ),
    )
    .toBe(2);
  await page.getByRole("button", { name: "Welcome", exact: true }).click();
  await page.getByRole("button", { name: /Open a movie/ }).click();
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "config · 2.config", exact: true }),
  ).toHaveValue("{bad-json");
  await expect(
    page.getByRole("button", { name: "Review exact inputs" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => (window as any).fixture.submissions),
  ).toEqual([]);
});

test("collapse editor, edit a queued node and save an idle replacement", async ({
  page,
}) => {
  await openFixture(page, movie(), local);
  await page
    .getByRole("button", { name: "Target keyframe", exact: true })
    .click();
  await page.getByRole("button", { name: "Pilot / Coast / Frame 01" }).click();
  await page.getByRole("button", { name: "Create generation job" }).click();
  await page.getByLabel("seed · 2.seed", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Review exact inputs" }).click();
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  // Changing the saved draft must not change the inputs restored from its queue receipt.
  await page.getByLabel("seed · 2.seed", { exact: true }).fill("99");
  await page.getByRole("button", { name: "Collapse draft editor" }).click();
  await expect(page.getByLabel("Job draft name")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit queued batch" }).click();
  await expect(page.getByLabel("seed · 2.seed", { exact: true })).toHaveValue(
    "7",
  );
  await page
    .getByRole("button", { name: "Execution node", exact: true })
    .click();
  await page.getByRole("button", { name: /ComfyUI 2 comfyui/ }).click();
  // Pending queue edits survive reopening as a saved draft.
  await page.getByRole("button", { name: "Welcome", exact: true }).click();
  await page.getByRole("button", { name: /Open a movie/ }).click();
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await page
    .getByRole("button", { name: /Generation 1 edit.*workflow items/ })
    .click();
  await page.getByRole("button", { name: "Review exact inputs" }).click();
  await expect(page.getByRole("button", { name: /Run now/ })).toBeDisabled();
  await page.getByRole("button", { name: "Save queue changes" }).click();
  const state = await page.evaluate(() => ({
    submissions: (window as any).fixture.submissions,
  }));
  expect(state.submissions).toEqual([]);
  await expect(
    page.getByRole("button", { name: "Run queued batch", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByText(/ComfyUI 2: paused/)).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/jobs-queue-edit.png",
    fullPage: true,
  });
});

test("clear finished queue entries persists without removing history or active jobs", async ({
  page,
}) => {
  await openFixture(page, movie(), local);
  await page
    .getByRole("button", { name: "Target keyframe", exact: true })
    .click();
  await page.getByRole("button", { name: "Pilot / Coast / Frame 01" }).click();
  await page.getByRole("button", { name: "Create generation job" }).click();
  for (let i = 0; i < 4; i++)
    await page
      .getByRole("button", { name: "Duplicate item", exact: true })
      .click();
  await page.getByRole("button", { name: "Review exact inputs" }).click();
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await page.evaluate(() =>
    (window as any).fixture.setJobStates([
      "completed",
      "failed",
      "canceled",
      "submitted",
      "unknown",
    ]),
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".queue-job")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Clear finished", exact: true })
    .click();
  await expect(page.locator(".queue-job")).toHaveCount(2);
  await expect(page.locator(".queue-job .state-unknown")).toBeVisible();
  await expect(page.locator(".queue-job .state-submitted")).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).fixture.jobHistory().length),
  ).toBe(5);
  await page.reload();
  await page.getByRole("button", { name: /Open a movie/ }).click();
  await expect(page.locator(".queue-job")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Clear finished", exact: true }),
  ).toBeDisabled();
});
