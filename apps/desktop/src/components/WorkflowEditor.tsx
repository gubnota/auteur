import { InitializationRecipe } from "./InitializationRecipe";
import { useEffect, useState } from "react";
import type {
  Binding,
  Connection,
  Workflow,
  WorkflowLayout,
  WorkflowWrapper,
} from "../lib/types";
import { call, exportDestination } from "../lib/bridge";
import { workflowForTarget } from "../lib/job-inputs";
import { Field, Picker, Toggle } from "./Controls";
import { WorkflowTarget } from "./WorkflowTarget";
import { WorkflowForm } from "./WorkflowForm";
import { AgentWorkflowSetup } from "./AgentWorkflowSetup";
import { SourceLink } from "./SourceLink";
import { WorkflowSetup, dependencyDestination } from "./WorkflowSetup";
import { WorkflowReadme } from "./WorkflowReadme";
const defaults: WorkflowWrapper = {
  familyId: "",
  variantName: "Default",
  collection: "",
  description: "",
  readme: "",
  os: "any",
  architecture: "any",
  precision: "default",
};
export function WorkflowEditor({
  workflow: w,
  onBusyChange,
  workflows,
  connection,
  selectVariant,
  change,
  prepare,
  saveForm,
  notify,
}: {
  workflow: Workflow;
  onBusyChange: (busy: boolean) => void;
  workflows: Workflow[];
  connection?: Connection;
  selectVariant: (id: string) => void;
  change: (fn: (w: Workflow) => void) => void;
  prepare: (w: string, c: string) => Promise<void>;
  saveForm: (bindings: Binding[], layout: WorkflowLayout) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [tab, setTab] = useState(w.wrapper?.exampleId ? "Guide" : "Inputs"),
    [editGuide, setEditGuide] = useState(false);
  const [targetBusy, setTargetBusy] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const busy = targetBusy || setupBusy;
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  const meta = { ...defaults, ...w.wrapper };
  const family = meta.familyId || w.id;
  const variants = workflows.filter(
    (v) => (v.wrapper?.familyId || v.id) === family,
  );
  const effective = workflowForTarget(w, connection?.id ?? "")!;
  const profile = w.profiles?.find((p) => p.connectionId === connection?.id);
  const metadata = (part: Partial<WorkflowWrapper>) =>
    change((x) => {
      x.wrapper = { ...defaults, ...x.wrapper, ...part };
    });
  const outputs = (profile?.outputs ?? w.outputs ?? []).map((o) => ({
    nodeId: o.nodeId,
    label: o.label,
    selected: true,
    ...w.layout?.outputs.find((l) => l.nodeId === o.nodeId),
  }));
  const [outputDraft, setOutputDraft] = useState<
    WorkflowLayout["outputs"] | null
  >(null);
  const saveOutputs = async () => {
    try {
      await saveForm(effective.bindings, {
        inputs: w.layout?.inputs ?? [],
        outputs: outputDraft ?? outputs,
      });
      setOutputDraft(null);
      notify("Result selection saved");
    } catch (e) {
      notify(String(e));
    }
  };
  const exportBundle = async (collection: boolean) => {
    try {
      const path = await exportDestination(
        `${collection ? meta.collection : w.name}.mymovie-workflow`,
      );
      if (path) {
        await call("export_workflow_bundle", {
          workflowId: w.id,
          collection,
          path,
        });
        notify(
          "Portable wrapper exported; prepare it on each destination node",
        );
      }
    } catch (e) {
      notify(String(e));
    }
  };
  if (meta.exampleId)
    return (
      <div className="workflow-editor">
        <p className="example-label">
          Immutable example · configure job values in Generate. Create an
          editable copy to change the wrapper.
        </p>
        {variants.length > 1 && (
          <Picker
            title="Platform variant"
            disabled={busy}
            value={w.id}
            options={variants.map((v) => ({
              id: v.id,
              label: v.wrapper?.variantName || v.name,
              description: `${v.wrapper?.os} · ${v.wrapper?.architecture} · ${v.wrapper?.precision}`,
            }))}
            onChange={selectVariant}
          />
        )}
        <WorkflowTarget
          install={() => setTab("Dependencies")}
          locked={setupBusy}
          onBusyChange={setTargetBusy}
          workflow={w}
          connection={connection}
          prepare={prepare}
          notify={notify}
        />
        <div
          className="editor-tabs"
          role="tablist"
          aria-label="Workflow editor"
        >
          {["Inputs", "Outputs", "Dependencies", "Guide"].map((t) => (
            <button
              key={t}
              role="tab"
              disabled={busy}
              aria-selected={tab === t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <section role="tabpanel" aria-label={tab}>
          {tab === "Guide" && <WorkflowReadme workflow={w} />}
          {tab === "Inputs" && (
            <>
              <h3>Exposed inputs</h3>
              <p>
                Create an editable copy to change these slots. Set their values
                for each job in Generate.
              </p>
              {effective.bindings.map((b) => (
                <article className="panel" key={`${b.nodeId}:${b.input}`}>
                  <strong>
                    {w.layout?.inputs.find(
                      (i) => i.nodeId === b.nodeId && i.input === b.input,
                    )?.label || b.semantic}
                  </strong>
                  <small>
                    {b.nodeId}.{b.input} ·{" "}
                    {b.media?.kind || b.valueType || "value"}
                  </small>
                </article>
              ))}
              {!effective.bindings.length && (
                <p>
                  Prepare inputs on a compatible instance to discover available
                  controls.
                </p>
              )}
            </>
          )}
          {tab === "Outputs" && (
            <>
              <h3>Collected results</h3>
              {outputs.map((o) => (
                <article className="panel" key={o.nodeId}>
                  <strong>{o.label}</strong>
                  <small>
                    Node {o.nodeId} · {o.selected ? "Collected" : "Excluded"}
                  </small>
                </article>
              ))}
              {!outputs.length && (
                <p>
                  Prepare inputs on a compatible instance to discover output
                  sinks.
                </p>
              )}
            </>
          )}
          {tab === "Dependencies" && (
            <>
              <AgentWorkflowSetup
                locked={targetBusy}
                onBusyChange={setSetupBusy}
                workflow={w}
                connection={connection}
                prepare={prepare}
              />
              <h3>Included dependencies</h3>
              {(w.requirements?.artifacts ?? []).map((a) => (
                <article
                  className="panel"
                  key={`${a.kind}:${a.category}:${a.target}`}
                >
                  <strong>{a.target}</strong>
                  <small>{dependencyDestination(a)}</small>
                  <SourceLink source={a.source} />
                </article>
              ))}
              {!!w.wrapper?.initialization?.length && (
                <details>
                  <summary>Initialization recipe</summary>
                  {w.wrapper.initialization.map((step, n) => (
                    <section key={n}>
                      <h3>{step.name}</h3>
                      <pre>{`# Check\n${step.checkScript ?? "# No custom check"}\n# Install\n${step.script}\n# Verify\n${step.verifyScript ?? "# Inventory verification"}`}</pre>
                    </section>
                  ))}
                </details>
              )}
              <p>
                Example dependencies are read-only. Use Create editable copy
                above to change sources, destinations or exposed controls.
              </p>
            </>
          )}
        </section>
        <button onClick={() => void exportBundle(false)}>
          Export workflow package
        </button>
      </div>
    );
  return (
    <div className="workflow-editor">
      {meta.exampleId && (
        <p className="example-label">
          Example · reusable Studio workflow · illustration preview
        </p>
      )}
      <Field
        label="Workflow name"
        value={w.name}
        onChange={(name) =>
          change((x) => {
            x.name = name;
          })
        }
      />
      <div className="workflow-summary">
        <span className="compatibility-badge">
          {w.requirements?.compatibility ?? "unspecified"}
        </span>
        <span>
          {w.editorGraph ? "Original ComfyUI workflow" : "ComfyUI API graph"}
        </span>
        <code>{w.version.slice(0, 12)}</code>
      </div>
      {!!meta.description && <p>{meta.description}</p>}
      {variants.length > 1 && (
        <Picker
          title="Platform variant"
          disabled={busy}
          value={w.id}
          options={variants.map((v) => ({
            id: v.id,
            label: v.wrapper?.variantName || v.name,
            description: `${v.requirements?.compatibility ?? "unspecified"} · ${v.wrapper?.os ?? "any"} · ${v.wrapper?.architecture ?? "any"}`,
          }))}
          onChange={selectVariant}
        />
      )}
      <WorkflowTarget
        install={() => setTab("Dependencies")}
        locked={setupBusy}
        onBusyChange={setTargetBusy}
        workflow={w}
        connection={connection}
        prepare={prepare}
        notify={notify}
      />
      <div className="editor-tabs" role="tablist" aria-label="Workflow editor">
        {["Inputs", "Outputs", "Dependencies", "Guide"].map((t) => (
          <button
            key={t}
            role="tab"
            disabled={busy}
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <section role="tabpanel" aria-label={tab}>
        {tab === "Inputs" && (
          <WorkflowForm
            key={`${w.id}:${connection?.id}:${profile?.registryHash}`}
            workflow={w}
            connectionId={connection?.id ?? ""}
            save={saveForm}
          />
        )}
        {tab === "Outputs" && (
          <>
            <h3>Collect results</h3>
            <p>
              Selected sinks become render-tagged Library media. ComfyUI still
              executes its output nodes; collection controls which returned
              files the global Library keeps.
            </p>
            {!outputs.length && (
              <p className="muted">
                Prepare on a compatible node to discover output sinks.
              </p>
            )}
            {(outputDraft ?? outputs).map((o, n) => (
              <article className="jobs-input" key={o.nodeId}>
                <Field
                  label={`Output ${o.nodeId} label`}
                  value={o.label}
                  onChange={(label) =>
                    setOutputDraft(
                      (outputDraft ?? outputs).map((v, i) =>
                        i === n ? { ...v, label } : v,
                      ),
                    )
                  }
                />
                <Toggle
                  label={`Collect output ${o.nodeId}`}
                  checked={o.selected}
                  onChange={(selected) =>
                    setOutputDraft(
                      (outputDraft ?? outputs).map((v, i) =>
                        i === n ? { ...v, selected } : v,
                      ),
                    )
                  }
                />
              </article>
            ))}
            {!!outputs.length && (
              <button
                className="primary"
                disabled={
                  !(outputDraft ?? outputs).some((o) => o.selected) ||
                  (outputDraft ?? outputs).some((o) => !o.label.trim())
                }
                onClick={() => void saveOutputs()}
              >
                Save output selection
              </button>
            )}
          </>
        )}
        {tab === "Dependencies" && (
          <>
            <AgentWorkflowSetup
              locked={targetBusy}
              onBusyChange={setSetupBusy}
              workflow={w}
              connection={connection}
              prepare={prepare}
            />
            <div className="editor-grid">
              <Field
                label="Variant name"
                value={meta.variantName}
                onChange={(variantName) => metadata({ variantName })}
              />
              <Picker
                title="Operating system"
                value={meta.os}
                options={["any", "macos", "linux", "windows"].map((id) => ({
                  id,
                  label: id,
                }))}
                onChange={(os) => metadata({ os })}
              />
              <Picker
                title="Architecture"
                value={meta.architecture}
                options={["any", "arm64", "x86_64"].map((id) => ({
                  id,
                  label: id,
                }))}
                onChange={(architecture) => metadata({ architecture })}
              />
              <Field
                label="Precision"
                value={meta.precision}
                onChange={(precision) => metadata({ precision })}
              />
            </div>
            <Picker
              title="Workflow family"
              value={family}
              options={[
                { id: w.id, label: "Standalone variant" },
                ...workflows
                  .filter((v) => v.id !== w.id)
                  .map((v) => ({
                    id: v.wrapper?.familyId || v.id,
                    label: v.name,
                  })),
              ].filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i)}
              onChange={(familyId) => metadata({ familyId })}
            />
            <p className="muted">
              Import each alternate graph once, then assign it to the same
              family. Every variant keeps separate requirements and node
              preparations.
            </p>
            <Field
              label="Python dependencies (one package==version per line)"
              multiline
              value={(meta.pythonPackages ?? []).join("\n")}
              onChange={(value) =>
                metadata({
                  pythonPackages: value
                    .split("\n")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
            />
            <InitializationRecipe
              steps={meta.initialization ?? []}
              change={(initialization) => metadata({ initialization })}
            />
            <WorkflowSetup
              workflow={w}
              connectionId={connection?.id ?? ""}
              change={(requirements) =>
                change((x) => {
                  x.requirements = requirements;
                })
              }
            />
          </>
        )}
        {tab === "Guide" && (
          <>
            <div className="jobs-toolbar">
              <button onClick={() => setTab("Dependencies")}>
                Edit dependencies
              </button>
              <button onClick={() => setEditGuide(!editGuide)}>
                {editGuide ? "Preview guide" : "Edit guide"}
              </button>
              <button onClick={() => void exportBundle(false)}>
                Export wrapped workflow
              </button>
              <button
                disabled={!meta.collection.trim()}
                onClick={() => void exportBundle(true)}
              >
                Export collection
              </button>
            </div>
            {editGuide && (
              <>
                <Field
                  label="Collection name"
                  value={meta.collection}
                  onChange={(collection) => metadata({ collection })}
                />
                <Field
                  label="Description"
                  value={meta.description}
                  onChange={(description) => metadata({ description })}
                />
                <Field
                  label="README (Markdown)"
                  multiline
                  value={meta.readme}
                  onChange={(readme) => metadata({ readme })}
                />
                <label className="illustration-import">
                  Import guide illustration
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        notify("Choose an illustration under 2 MiB");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () =>
                        metadata({ illustration: String(reader.result) });
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {meta.illustration && (
                  <button onClick={() => metadata({ illustration: null })}>
                    Remove illustration
                  </button>
                )}
              </>
            )}
            <WorkflowReadme workflow={w} />
          </>
        )}
      </section>
    </div>
  );
}
