import type { Page } from "@playwright/test";
import type { Project, AppSettings } from "../../apps/desktop/src/lib/types";

export const project: Project = {
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
export const settings: AppSettings = {
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
export async function openFixture(
  page: Page,
  movie = project,
  connections = settings,
) {
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
    let project = ${JSON.stringify(movie)};
    let settings = ${JSON.stringify(connections)};
    window.fixture = { submissions: [] };
    export async function call(command, args = {}) {
      if (command === 'get_settings') return settings;
      if (command === 'recent_projects' || command === 'take_opened_projects') return [];
      if (command === 'close_project') return null;
      if (command === 'get_project') return project;
      if (command === 'open_project') return project;
      if (command === 'save_project') { project = {...args.project, revision: args.expectedRevision + 1}; window.fixture.saved = project; return project; }
      if (command === 'list_jobs' || command === 'refresh_jobs' || command === 'list_job_runs') return [];
      if (command === 'preview_job_draft') return { items: args.draft.items.map(item => ({ semantic: item.values, frameId: args.draft.frameId, workflowId: item.workflowId, connectionId: item.connectionId })) };
      if (command === 'start_job_draft') { window.fixture.submissions.push(args); return []; }
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
