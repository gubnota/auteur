import { test, expect } from "@playwright/test";
import { openFixture, project, settings } from "./fixtures/jobs";
import type { WorkflowInput } from "../apps/desktop/src/lib/types";

test("saved catalogue prepares a two-image form, maps ratio and reuses its layout", async ({
  page,
}) => {
  const movie = structuredClone(project);
  movie.episodes = [];
  movie.assets = ["Source image", "Face reference"].map((name, i) => ({
    id: `image-${i}`,
    name,
    kind: "image",
    path: `media/${i}.png`,
    sha256: String(i).repeat(64),
    size: 10,
  }));
  const w = movie.workflows[0];
  w.bindings = [];
  w.editorGraph = { nodes: [{ id: 1, type: "LoadImage" }] }; // Bridge fixture; real exporter has separate native acceptance.
  w.graph = {
    "1": { class_type: "LoadImage", inputs: { image: "source.png" } },
    "2": { class_type: "LoadImage", inputs: { image: "face.png" } },
    "3": {
      class_type: "EmptyImage",
      inputs: { "resize_type.width": 512, "resize_type.height": 512 },
    },
    "4": { class_type: "Text", inputs: { text: "Long prompt ".repeat(150) } },
    "5": {
      class_type: "SaveImage",
      inputs: { images: ["3", 0], filename_prefix: "result" },
    },
  };
  w.inputs = Object.entries(w.graph).flatMap(([nodeId, node]) =>
    Object.entries(node.inputs)
      .filter(([, v]) => !Array.isArray(v))
      .map(
        ([input, value]) =>
          ({
            binding: {
              semantic: `${nodeId}.${input}`,
              nodeId,
              input,
              valueType: typeof value === "number" ? "number" : "string",
              ...(input === "image"
                ? {
                    media: {
                      kind: "image",
                      role: nodeId === "1" ? "sourceImage" : "referenceImage",
                      order: Number(nodeId),
                    },
                  }
                : {}),
            },
            label: `${node.class_type} · ${input}`,
            required: true,
            control:
              input === "image"
                ? "media"
                : typeof value === "number"
                  ? "number"
                  : "multiline",
            default: value,
            choices: [],
            advanced: false,
            ...(typeof value === "number"
              ? { min: 64, max: 2048, step: 8 }
              : {}),
          }) as WorkflowInput,
      ),
  );
  w.outputs = [{ nodeId: "5", label: "Final image", classType: "SaveImage" }];
  const nodes = structuredClone(settings);
  nodes.connections = [
    {
      id: "local",
      name: "Local Mac",
      kind: "comfyui",
      url: "http://127.0.0.1:8188",
      concurrency: 1,
    },
  ];
  await openFixture(page, movie, nodes);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page
    .getByRole("button", { name: "Create a generation draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Browse workflow catalogue", exact: true })
    .click();
  await page.getByLabel("Search saved workflows", { exact: true }).fill(w.name);
  await page.getByRole("button", { name: new RegExp(`^${w.name} `) }).click();
  await page
    .getByRole("button", { name: "Prepare / refresh inputs", exact: true })
    .click();
  await expect(
    page.getByText("Prepared · 6 inputs · 1 outputs", { exact: true }),
  ).toBeVisible();
  for (const [slot, name] of [
    ["1.image", "Source image"],
    ["2.image", "Face reference"],
  ]) {
    await page
      .getByRole("button", { name: `Media source for ${slot}`, exact: true })
      .click();
    await page.getByRole("button", { name: new RegExp(`^${name} `) }).click();
  }
  await page.getByRole("button", { name: "Output ratio", exact: true }).click();
  await page.getByRole("button", { name: "9:16", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Apply ratio to bound dimensions",
      exact: true,
    })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).fixture.saved?.jobDrafts?.[0]?.items[0].values[
            "3.resize_type.height"
          ],
      ),
    )
    .toBe(912);
  await page
    .getByRole("button", { name: "Customize input form", exact: true })
    .click();
  await page
    .getByLabel("Input label", { exact: true })
    .first()
    .fill("Source photograph");
  await page
    .getByLabel("Group", { exact: true })
    .first()
    .fill("Face swap references");
  await page
    .getByRole("button", { name: "Save reusable form", exact: true })
    .click();
  await expect(
    page.getByText("Source photograph", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add to batch", exact: true }).click();
  await expect(
    page.getByText("Source photograph", { exact: true }),
  ).toBeVisible();
  expect(await page.locator("select").count()).toBe(0);
  await page.screenshot({
    path: "docs/screenshots/workflow-catalogue.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Welcome", exact: true }).click();
  await page.getByRole("button", { name: /Open a movie/ }).click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(
    page.getByText("Source photograph", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Output ratio", exact: true }),
  ).toContainText("9:16");
  const saved = await page.evaluate(() => (window as any).fixture.saved);
  expect(saved.workflows[0].editorGraph).toEqual({
    nodes: [{ id: 1, type: "LoadImage" }],
  });
  expect(saved.workflows[0].lastTarget).toBe("local");
  expect(saved.jobDrafts[0].items).toHaveLength(2);
});
