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
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  await page.getByRole("button", { name: /ComfyUI 2 comfyui/ }).click();
  await page.getByRole("button", { name: "Review exact inputs" }).click();
  await page.getByRole("button", { name: /Validate & start 2 jobs/ }).click();
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
