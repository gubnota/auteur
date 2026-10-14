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
    .getByText("Workflow preparation & exports", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Prepare inputs", exact: true })
    .click();
  await expect(
    page.getByText("Prepared for Local Mac · 6 inputs · 1 outputs", {
      exact: true,
    }),
  ).toBeVisible();
  for (const [slot, name] of [
    ["1.image", "Source image"],
    ["2.image", "Face reference"],
  ]) {
    await page
      .getByRole("button", {
        name: new RegExp(`Media source for LoadImage · image`),
      })
      .nth(slot === "1.image" ? 0 : 1)
      .click();
    await page.getByRole("button", { name: new RegExp(`^${name} `) }).click();
  }
  await page
    .getByRole("button", { name: "Swap the two image inputs", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).fixture.saved?.jobDrafts?.[0]?.items[0].assets[
            "1.image"
          ],
      ),
    )
    .toBe("image-1");
  await page
    .getByRole("button", { name: "Install in ComfyUI", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fixture.installs.length))
    .toBe(1);
  expect(
    await page.evaluate(() => (window as any).fixture.submissions),
  ).toEqual([]);
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
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page.getByRole("button", { name: /Imported image workflow/ }).click();
  await page.locator(".workflow-form details summary").first().click();
  await page
    .getByLabel("Display label", { exact: true })
    .first()
    .fill("Source photograph");
  await page
    .getByRole("button", { name: "Save reusable inputs", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
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

test("configure API media slots once, mark used fields, reuse searched gallery IDs in later jobs", async ({
  page,
}) => {
  const movie = structuredClone(project);
  movie.episodes = [];
  movie.assets = ["Source photograph", "Face portrait"].map((name, i) => ({
    id: `image-${i}`,
    name,
    kind: "image",
    path: `media/${i}.png`,
    sha256: String(i).repeat(64),
    size: 10,
  }));
  const w = movie.workflows[0];
  w.bindings = [];
  w.graph = {
    "19": { class_type: "LoadImage", inputs: { image: "source.png" } },
    "86": { class_type: "LoadImage", inputs: { image: "face.png" } },
    "88": { class_type: "LoadImage", inputs: { image: "unused.png" } },
    "90": {
      class_type: "SaveImage",
      inputs: { images: ["19", 0], other: ["86", 0] },
    },
  };
  await openFixture(page, movie, settings);
  for (const [id, label] of [
    ["19", "Base photograph"],
    ["86", "Face identity"],
  ]) {
    await page
      .getByRole("button", { name: "Select literal input", exact: true })
      .click();
    await page
      .getByRole("button", { name: new RegExp(`^${id}.image · LoadImage`) })
      .click();
    await page
      .getByRole("button", { name: "Expose selected input", exact: true })
      .click();
    const input = page.locator(".workflow-form details").last();
    await input.locator("summary").click();
    await input.getByLabel("Display label", { exact: true }).fill(label);
  }
  await page
    .getByRole("button", { name: "Select literal input", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^19.image · LoadImage/ }),
  ).toContainText("Used as 19.image");
  await expect(
    page.getByRole("button", { name: /^88.image · LoadImage/ }),
  ).toContainText("Unused loader");
  await page.getByRole("button", { name: /^19.image · LoadImage/ }).click();
  await expect(
    page.getByRole("button", { name: "Expose selected input", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Save reusable inputs", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create generation job", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Media source for Base photograph/ })
    .click();
  await page.getByLabel("Search media", { exact: true }).fill("Source");
  await expect(page.locator(".media-tile")).toHaveCount(1);
  await page
    .getByRole("button", { name: /^Source photograph · image/ })
    .click();
  await page
    .getByRole("button", { name: /Media source for Face identity/ })
    .click();
  await expect(
    page.getByRole("button", { name: /^Source photograph · image/ }),
  ).toContainText("Assigned to another input");
  await page.getByRole("button", { name: /^Face portrait · image/ }).click();
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await page
    .getByRole("button", { name: "New generation", exact: true })
    .click();
  await expect(
    page.getByText("Base photograph", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Face identity", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Welcome", exact: true }).click();
  await page.getByRole("button", { name: /Open a movie/ }).click();
  const saved = await page.evaluate(() => (window as any).fixture.saved);
  expect(saved.workflows[0].bindings.map((b: any) => b.nodeId)).toEqual([
    "19",
    "86",
  ]);
  expect(saved.assets.map((a: any) => a.id)).toEqual(["image-0", "image-1"]);
  expect(
    await page.evaluate(
      () =>
        (window as any).fixture.jobHistory()[0].snapshot.media["19.image"].id,
    ),
  ).toBe("image-0");
  expect(
    await page.evaluate(() => (window as any).fixture.submissions),
  ).toEqual([]);
});

test("wrapper guide, optional input and output selection persist independently of the graph", async ({
  page,
}) => {
  const movie = structuredClone(project);
  const w = movie.workflows[0];
  w.outputs = [
    { nodeId: "8", label: "Image", classType: "SaveImage" },
    { nodeId: "9", label: "Preview", classType: "PreviewImage" },
  ];
  const original = structuredClone(w.graph);
  await openFixture(page, movie, settings);
  await page.locator(".workflow-form details summary").first().click();
  await page
    .getByLabel("Optional (keep original default if unassigned)", {
      exact: true,
    })
    .first()
    .check();
  await page
    .getByRole("button", { name: "Save reusable inputs", exact: true })
    .click();
  await page.getByRole("tab", { name: "Outputs", exact: true }).click();
  await page
    .getByLabel("Output 8 label", { exact: true })
    .fill("Final artwork");
  await page.getByLabel("Collect output 9", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Save output selection", exact: true })
    .click();
  await page.getByRole("tab", { name: "Guide", exact: true }).click();
  await page.getByRole("button", { name: "Edit guide", exact: true }).click();
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Portrait collection");
  await page
    .getByLabel("README (Markdown)", { exact: true })
    .fill(
      "# Portrait guide\nDrop a source and a reference.\n- Use the CUDA variant on Linux.",
    );
  await page
    .getByRole("button", { name: "Preview guide", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Portrait guide", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).fixture.saved.workflows[0].wrapper?.collection,
      ),
    )
    .toBe("Portrait collection");
  const saved = await page.evaluate(
    () => (window as any).fixture.saved.workflows[0],
  );
  expect(saved.graph).toEqual(original);
  expect(saved.layout.inputs[0].optional).toBe(true);
  expect(saved.layout.outputs).toEqual([
    { nodeId: "8", label: "Final artwork", selected: true },
    { nodeId: "9", label: "Preview", selected: false },
  ]);
  await page.screenshot({
    path: "docs/screenshots/workflow-wrapper-guide.png",
    fullPage: true,
  });
});
