import type { Page } from "@playwright/test";
import type {
  Project,
  AppSettings,
  Workflow,
} from "../../apps/desktop/src/lib/types";

export const project: Project = {
  id: "movie",
  name: "ComfyUI Verification",
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
  connections: ["Local ComfyUI", "Second node"].map((name, i) => ({
    id: `account-${i}`,
    name,
    kind: "comfyui",
    url: "http://localhost:8188",
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
  options: { catalogue?: Workflow[]; setupReports?: unknown[] } = {},
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
    let settings = JSON.parse(sessionStorage.getItem("fixture-settings") ?? "null") ?? ${JSON.stringify(connections)};
    let catalogue = ${JSON.stringify(options.catalogue ?? movie.workflows)};
    let setupPending = false; let staleSettings = null; let setupReports = ${JSON.stringify(options.setupReports ?? [])}; let setupOperations = {}; let initializations = [];
    let runnerTokens = { MYMOVIE_AGENT_TOKEN: 'fixture-agent-'.repeat(3), MYMOVIE_DESKTOP_TOKEN: 'fixture-desktop-'.repeat(3) };
    let runs = []; let jobs = JSON.parse(sessionStorage.getItem("fixture-jobs") ?? "[]");
    let recents = Array.from({length: 12}, (_, i) => ({name: "Recent movie " + i, path: "/tmp/movie-" + i + ".mymovie", opened: "2026-10-14T10:00:00Z"}));
    window.fixture = { initializations: () => initializations, setInitializations: rows => { initializations = rows; }, setupCalls: [], holdSetup: value => { setupPending = value; }, staleSettingsReturned: false, preparations: [], staleSettings: () => structuredClone(settings), returnSettingsOnce: value => { staleSettings = value; }, movie: () => project, submissions: [], enqueued: [], installs: [], thumbnails: [], setResults: results => { jobs.forEach((job, i) => { job.results = results[i] ?? []; job.state = "succeeded"; }); sessionStorage.setItem("fixture-jobs", JSON.stringify(jobs)); }, setJobStates: states => { jobs.forEach((job, i) => job.state = states[i]); sessionStorage.setItem("fixture-jobs", JSON.stringify(jobs)); }, jobHistory: () => jobs };
    export async function call(command, args = {}) {
      if (command === 'plan_deployment' || command === 'runner_action') { window.fixture.setupCalls.push({command, ...args}); const id = 'setup-' + window.fixture.setupCalls.length; setupOperations[id] = setupReports.shift() ?? {state:'ready',ready:true}; return {id}; }
      if (command === 'list_initializations') return initializations.filter(r => r.connectionId === args.connectionId);
      if (command === 'start_initialization') { window.fixture.setupCalls.push({command, ...args}); const id = 'initialization-1'; const w = project.workflows.find(w => w.id === args.workflowId); initializations = [{id,connectionId:args.connectionId,workflowId:w.id,workflowName:w.name,state:'running',createdAt:Math.floor(Date.now()/1000),lastContact:Math.floor(Date.now()/1000),progress:{stage:'download',detail:'Downloading sd15.safetensors',bytes:104857600,totalBytes:2147483648,log:[{stage:'inventory',detail:'Exact dependencies reviewed',at:Math.floor(Date.now()/1000)}]}}]; return {id}; }
      if (command === 'apply_initialization') { window.fixture.setupCalls.push({command,...args}); return null; }
      if (command === 'cancel_initialization') { initializations.find(r => r.id === args.operationId).state='canceled'; return {}; }
      if (command === 'archive_workflow') { const w = project.workflows.find(w => w.id === args.workflowId); w.wrapper = {...w.wrapper, archivedAt: args.archived ? new Date().toISOString() : undefined}; project.revision++; return project; }
      if (command === 'runner_operation') return setupPending ? {state:'running',report:{}} : {state:'completed',report:setupOperations[args.operationId]};
      if (command === 'get_runner_tokens') return structuredClone(runnerTokens);
      if (command === 'save_runner_tokens') { runnerTokens = structuredClone(args.tokens); return; }
      if (command === 'save_credential') { if (args.secret !== runnerTokens.MYMOVIE_DESKTOP_TOKEN) throw new Error('Wrong desktop token'); return 'connection:' + args.connectionId; }
      if (command === 'get_settings') { if (staleSettings) { const value = staleSettings; staleSettings = null; window.fixture.staleSettingsReturned = true; return value; } return settings; }
      if (command === 'save_settings') { settings = args.settings; sessionStorage.setItem("fixture-settings", JSON.stringify(settings)); return settings; }
      if (command === 'recent_projects') return recents;
      if (command === 'clear_recent_projects') { recents = []; return recents; }
      if (command === 'remove_recent_project') { recents = recents.filter(r => r.path !== args.path); return recents; }
      if (command === 'take_opened_projects') return [];
      if (command === 'video_thumbnail') { window.fixture.thumbnails.push(args); return true; }
      if (command === 'install_workflow') { window.fixture.installs.push(args); return {installed:true, loadedCanvas:false, libraryPath:'workflows/MyMovie/fixture.json'}; }
      if (command === 'close_project') return null;
      if (command === 'get_project') return project;
      if (command === 'list_workflows') return catalogue;
      if (command === 'catalogue_workflow') {
        const w = project.workflows.find(w => w.id === args.workflowId);
        catalogue = [...catalogue.filter(x => x.id !== w.id), structuredClone(w)]; return w;
      }
      if (command === 'pin_workflow') {
        const w = catalogue.find(w => w.id === args.workflowId);
        if (!project.workflows.some(x => x.id === w.id)) project.workflows.push(structuredClone(w));
        return project;
      }
      if (command === 'save_workflow_form') { const w = project.workflows.find(w => w.id === args.workflowId); w.bindings = args.bindings; w.layout = args.layout; project.revision++; window.fixture.saved = project; return project; }
      if (command === 'asset_availability') return {};
      if (command === 'save_workflow_layout') {
        const w = project.workflows.find(w => w.id === args.workflowId);
        w.layout = args.layout;
        catalogue = [...catalogue.filter(x => x.id !== w.id), structuredClone(w)];
        project.revision++; window.fixture.saved = project; return project;
      }
      if (command === 'prepare_workflow') {
        window.fixture.preparations.push(args);
        const w = project.workflows.find(w => w.id === args.workflowId);
        w.profiles = [...(w.profiles ?? []).filter(x => x.connectionId !== args.connectionId), {connectionId:args.connectionId, sourceHash:w.editorHash ?? w.version, apiHash:w.version, registryHash:'r', frontendHash:'f', compilerVersion:'fixture', graph:w.graph, inputs:w.inputs ?? [], outputs:w.outputs ?? []}];
        w.lastTarget = args.connectionId;
        project.revision++; window.fixture.saved = project; return project;
      }
      if (command === 'open_project') return project;
      if (command === 'save_project') { project = {...args.project, revision: args.expectedRevision + 1}; window.fixture.saved = project; return project; }
      if (command === 'list_jobs' || command === 'refresh_jobs') return jobs;
      if (command === 'list_job_runs') return runs;
      if (command === 'enqueue_job_draft' || command === 'replace_queued_job_run') { if (command === 'replace_queued_job_run') { const old = runs.find(r => r.id === args.runId); if (!old?.queued || old.state !== 'paused') throw new Error('Batch already started'); old.queued = false; old.state = 'canceled'; jobs.forEach(j => { if (j.runId === old.id) j.state = 'canceled'; }); } window.fixture.enqueued.push(args); const draft = project.jobDrafts.find(d => d.id === args.draftId); if (draft.queuedJobIds?.length) {jobs.forEach(j => {if(draft.queuedJobIds.includes(j.id)) j.state='canceled';});} const id = 'run-' + runs.length; const ids = draft.items.map((item, index) => { const jobId = id + '-job-' + index; jobs.push({id:jobId, runId:id, workflowId:item.workflowId, connectionId:item.connectionId, frameId:draft.frameId, workflowVersion:project.workflows.find(w => w.id === item.workflowId).version, state:'paused', progress:0, error:null, results:[], snapshot:{semantic:structuredClone(item.values),media:Object.fromEntries(Object.entries(item.assets).map(([k,id]) => [k,project.assets.find(a => a.id === id)])),bindings:structuredClone(item.bindings ?? project.workflows.find(w => w.id === item.workflowId).bindings),context:structuredClone(draft.context),connection:structuredClone(settings.connections.find(c => c.id === item.connectionId))}}); return jobId; }); runs.push({id, name:draft.name, draftId:draft.id, jobIds:ids, state:'paused', queued:true, createdAt:'2026-10-14'}); return jobs; }
      if (command === 'control_job_tasks') { const picked = jobs.filter(j => args.jobIds.includes(j.id)); if (picked.length !== args.jobIds.length || picked.some(j => j.state !== 'paused' || j.remoteId)) throw new Error('Only idle tasks'); picked.forEach(j => j.state = args.action === 'resume' ? 'submitted' : 'canceled'); if (args.action === 'resume') window.fixture.submissions.push(args); runs.forEach(r => { const children = jobs.filter(j => j.runId === r.id); r.queued = children.some(j => j.state === 'paused'); r.state = children.some(j => j.state === 'submitted') ? 'active' : r.queued ? 'paused' : 'finished'; }); return jobs; }
      if (command === 'notebook_setup_script') return '# Configure; install verified artifact; start workers';
      if (command === 'control_job_run') { const r = runs.find(r => r.id === args.runId); if (args.action === 'resume') { r.queued = false; r.state = 'submitted'; window.fixture.submissions.push(args); jobs.forEach(j => { if (j.runId === r.id) j.state = 'submitted'; }); } return jobs; }
      if (command === 'preview_job_draft') return { items: args.draft.items.map(item => ({ semantic: item.values, frameId: args.draft.frameId, workflowId: item.workflowId, connectionId: item.connectionId, deployment: project.workflows.find(w => w.id === item.workflowId).deployments?.find(d => d.connectionId === item.connectionId) })) };
      if (command === 'start_job_draft') { window.fixture.submissions.push(args); return []; }
      throw new Error('Unexpected fixture command: ' + command);
    }
    export async function pickFile() { return '/tmp/ui-fixture.mymovie'; }
    export async function pickDestination() { throw new Error('Not used'); }
    export async function pickReferenceImages() { throw new Error('Not used'); }
    export async function exportDestination() { return null; }
    export const mediaUrl = (root, asset) => asset.kind === 'video' ? '/fixture-video.mp4' : '';
    export const posterUrl = () => '/fixture-poster.jpg';
  `,
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Open a movie/ }).click();
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page.getByRole("button", { name: /Imported image workflow/ }).click();
  await page.locator(".workflow-job-entry summary").click();
}
