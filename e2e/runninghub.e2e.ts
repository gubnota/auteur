import { test, expect, type Page } from "@playwright/test";
import type { Project, AppSettings } from "../apps/desktop/src/lib/types";

const project: Project = {
  id: "movie",
  name: "RunningHub Verification",
  revision: 0,
  ratio: "16:9",
  positivePrompt: "Cinematic lighting",
  negativePrompt: "watermark",
  characters: [],
  assets: [],
  episodes: [
    {
      id: "episode",
      name: "Pilot",
      scenes: [
        {
          id: "scene",
          name: "Coast",
          positivePrompt: null,
          negativePrompt: null,
          shots: [
            {
              id: "shot",
              name: "Arrival",
              frames: [
                {
                  id: "frame",
                  name: "Frame 01",
                  assetId: null,
                  positivePrompt: "A quiet lighthouse",
                  negativePrompt: "",
                  includeCommon: true,
                  ratio: null,
                  characterIds: [],
                  comments: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  workflows: [
    {
      id: "workflow",
      name: "Imported image workflow",
      version: "a".repeat(64),
      mediaKind: "image",
      graph: {
        "1": {
          class_type: "CLIPTextEncode",
          inputs: { text: "original prompt" },
        },
      },
      bindings: [
        {
          semantic: "positivePrompt",
          nodeId: "1",
          input: "text",
          valueType: "string",
        },
      ],
    },
  ],
};
const settings: AppSettings = {
  theme: "light",
  queueHeight: 180,
  storage: {},
  notifications: [],
  logs: [],
  connections: ["Studio account", "Second account"].map((name, i) => ({
    id: `account-${i}`,
    name,
    kind: "runninghub",
    url: "https://www.runninghub.ai",
    credentialRef: "test-vault-reference",
    deploymentId: null,
    apiFamily: "workflow",
    concurrency: 1,
  })),
};
async function openFixture(page: Page) {
  // Intercept only the UI bridge: no native filesystem, credentials or provider calls.
  await page.route("**/@tauri-apps_api_webview.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "export const getCurrentWebview = () => ({ onDragDropEvent: async () => () => {} });",
    }),
  );
  await page.route("**/@tauri-apps_api_event.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "export const listen = async () => () => {};",
    }),
  );
  await page.route("**/src/lib/bridge.ts", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    export const native = true;
    let project = ${JSON.stringify(project)};
    let settings = ${JSON.stringify(settings)};
    window.fixture = { submissions: [] };
    export async function call(command, args = {}) {
      if (command === 'get_settings') return settings;
      if (command === 'recent_projects' || command === 'take_opened_projects') return [];
      if (command === 'get_project') return project;
      if (command === 'open_project') return project;
      if (command === 'save_project') { project = {...args.project, revision: args.expectedRevision + 1}; window.fixture.saved = project; return project; }
      if (command === 'list_jobs' || command === 'refresh_jobs') return [];
      if (command === 'submit_job') { window.fixture.submissions.push(args); return []; }
      throw new Error('Unexpected fixture command: ' + command);
    }
    export async function pickFile() { return '/tmp/ui-fixture.mymovie'; }
    export async function pickDestination() { throw new Error('Not used'); }
    export async function pickReferenceImages() { throw new Error('Not used'); }
    export const mediaUrl = () => '';
  `,
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Open a movie/ }).click();
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page.getByRole("button", { name: /Imported image workflow/ }).click();
}
async function chooseFrame(page: Page) {
  await page
    .getByRole("button", { name: "Target keyframe", exact: true })
    .click();
  await page.getByRole("button", { name: "Pilot / Coast / Frame 01" }).click();
  await page.getByRole("button", { name: "Create generation job" }).click();
}

test("imported workflow exposes job creation and explains the missing deployment", async ({
  page,
}) => {
  await openFixture(page);
  await expect(
    page.getByRole("button", { name: "Create generation job" }),
  ).toBeDisabled();
  await chooseFrame(page);
  await expect(
    page.getByText(/Importing JSON alone does not create a hosted deployment/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Validate & submit job" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => (window as any).fixture.submissions),
  ).toEqual([]);
});

test("account-specific mapping survives reopening and enables only the mapped account", async ({
  page,
}) => {
  await openFixture(page);
  const account = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: "Studio account" }) });
  await account
    .getByLabel("Workflow / AI App ID", { exact: true })
    .fill("123456789");
  await account.getByRole("button", { name: "RunningHub API family" }).click();
  await page
    .getByRole("button", { name: "Published AI App (v2)", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).fixture.saved?.workflows[0].deployments,
      ),
    )
    .toEqual([
      {
        connectionId: "account-0",
        deploymentId: "123456789",
        apiFamily: "ai-app",
      },
    ]);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: /Imported image workflow/ }).click();
  await expect(
    page.getByLabel("Workflow / AI App ID", { exact: true }).first(),
  ).toHaveValue("123456789");
  await chooseFrame(page);
  const submit = page.getByRole("button", { name: "Validate & submit job" });
  await expect(submit).toBeEnabled();
  await expect(
    page.getByText(/AI App 123456789 · Studio account/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  await page.getByRole("button", { name: /Second account runninghub/ }).click();
  await expect(submit).toBeDisabled();
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  await page.getByRole("button", { name: /Studio account runninghub/ }).click();
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: "artifacts/e2e/runninghub-job-review.png" });
  await submit.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fixture.submissions))
    .toEqual([
      {
        frameId: "frame",
        workflowId: "workflow",
        connectionId: "account-0",
        values: {},
      },
    ]);
});
