import { useState } from "react";
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
import { WorkflowSetup } from "./WorkflowSetup";
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
  workflows,
  connection,
  selectVariant,
  change,
  prepare,
  saveForm,
  notify,
}: {
  workflow: Workflow;
  workflows: Workflow[];
  connection?: Connection;
  selectVariant: (id: string) => void;
  change: (fn: (w: Workflow) => void) => void;
  prepare: (w: string, c: string) => Promise<void>;
  saveForm: (bindings: Binding[], layout: WorkflowLayout) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [tab, setTab] = useState("Inputs"),
    [editGuide, setEditGuide] = useState(false);
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
        `${collection ? meta.collection : w.name}.mymovie-workflow.json`,
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
  return (
    <div className="workflow-editor">
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
        workflow={w}
        connection={connection}
        prepare={prepare}
        notify={notify}
      />
      <div className="editor-tabs" role="tablist" aria-label="Workflow editor">
        {["Inputs", "Outputs", "Setup", "Guide"].map((t) => (
          <button
            key={t}
            role="tab"
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
              files this movie keeps.
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
        {tab === "Setup" && (
          <>
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
