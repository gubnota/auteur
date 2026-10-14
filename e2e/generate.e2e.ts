import { test, expect } from "@playwright/test";
import { openFixture, project, settings } from "./fixtures/jobs";

const movie = structuredClone(project);
movie.name = "Generate demo";
movie.episodes = [];
movie.assets = ["image", "video", "audio"].map((kind, i) => ({
  id: kind,
  name: `Reference ${kind}`,
  kind: kind as "image" | "video" | "audio",
  path: `media/${kind}`,
  sha256: String(i).repeat(64),
  size: 10,
}));
movie.workflows[0].bindings.push(
  ...(["image", "video", "audio"] as const).map((kind, i) => ({
    semantic: `reference${kind}`,
    nodeId: String(i + 2),
    input: "file",
    valueType: "string" as const,
    media: {
      kind,
      role:
        kind === "image"
          ? "startFrame"
          : kind === "video"
            ? "referenceVideo"
            : "referenceAudio",
      order: i,
    },
  })),
);
for (let i = 0; i < 3; i++)
  movie.workflows[0].graph[String(i + 2)] = {
    class_type: "MediaLoader",
    inputs: { file: "" },
  };
movie.workflows[0].requirements = { compatibility: "universal", artifacts: [] };
const nodes = structuredClone(settings);
nodes.connections = [8188, 8189].map((port, i) => ({
  id: `node-${i}`,
  name: `Studio node ${i + 1}`,
  kind: "comfyui" as const,
  url: `http://127.0.0.1:${port}`,
  concurrency: 1,
}));

test("standalone multi-media draft persists and reviews a batch on two nodes", async ({
  page,
}) => {
  await openFixture(page, movie, nodes);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page
    .getByRole("button", { name: "New generation", exact: true })
    .click();
  for (const kind of ["image", "video", "audio"]) {
    await page
      .getByRole("button", {
        name: new RegExp(`Media source for reference${kind}`),
      })
      .click();
    await page
      .getByRole("button", { name: new RegExp(`Reference ${kind} `) })
      .click();
  }
  await page.getByRole("button", { name: "Add to batch", exact: true }).click();
  await page
    .getByRole("button", { name: "Execution node", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Studio node 2 Automatic FIFO/ })
    .click();
  await page
    .getByRole("button", { name: "1. Imported image workflow", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).fixture.saved?.jobDrafts?.[0]?.items.length,
      ),
    )
    .toBe(2);
  await page.getByRole("button", { name: "Welcome", exact: true }).click();
  await page.getByRole("button", { name: /Open a movie/ }).click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  const saved = await page.evaluate(() => (window as any).fixture.saved);
  expect(saved.jobDrafts[0].context.kind).toBe("standalone");
  expect(saved.jobDrafts[0].items[0].assets).toEqual({
    referenceimage: "image",
    referencevideo: "video",
    referenceaudio: "audio",
  });
  expect(saved.jobDrafts[0].items[1].connectionId).toBe("node-1");
  await page.screenshot({
    path: "docs/screenshots/generate.png",
    fullPage: true,
  });

  await expect(
    page.getByRole("button", { name: "Review exact inputs", exact: true }),
  ).toBeDisabled(); // Second item still needs explicit media.
});

test("Generate removes several selected batch items without starting jobs", async ({
  page,
}) => {
  await openFixture(page, movie, nodes);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page
    .getByRole("button", { name: "New generation", exact: true })
    .click();
  const originalId = await page.evaluate(
    () => (window as any).fixture.saved.jobDrafts[0].items[0].id,
  );
  await page.getByRole("button", { name: "Add to batch", exact: true }).click();
  await page.getByRole("button", { name: "Add to batch", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove selected item", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove selected item", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).fixture.saved.jobDrafts[0].items.map((i: any) => i.id),
      ),
    )
    .toEqual([originalId]);
  await expect(
    page.getByText("Selected item 1 of 1", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove selected item", exact: true })
    .click();
  await expect(
    page.getByText("This batch is empty.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to queue", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Add to batch", exact: true }).click();
  await expect(
    page.getByText("Selected item 1 of 1", { exact: true }),
  ).toBeVisible();
});

test("workflow compatibility and pinned dependency validation use custom dialogs", async ({
  page,
}) => {
  await openFixture(page, movie, nodes);
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  await page
    .getByRole("button", { name: "Workflow compatibility", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Apple Silicon only Apple MPS/ })
    .click();
  await page
    .getByRole("button", { name: "Add model / plugin / wheel", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save dependency", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Close dialog", exact: true })
    .last()
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).fixture.saved?.workflows[0].requirements
            .compatibility,
      ),
    )
    .toBe("apple-silicon");
  await page
    .getByRole("button", { name: "Portable setup instructions", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Complete setup script" }),
  ).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
});
