import { ArrowUp, ArrowDown } from "lucide-react";
import { useState } from "react";
import type { InitializationStep } from "../lib/types";
import { Field, Modal, Picker } from "./Controls";
export function InitializationRecipe({
  steps,
  change,
}: {
  steps: InitializationStep[];
  change: (steps: InitializationStep[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null),
    [draft, setDraft] = useState<InitializationStep>({
      name: "",
      script: "",
      directory: "",
      timeoutSeconds: 600,
      policy: "recipe",
    });
  const edit = (index: number) => {
    setDraft(
      steps[index] ?? {
        name: "",
        script: "",
        directory: "",
        timeoutSeconds: 600,
        policy: "recipe",
      },
    );
    setEditing(index);
  };
  return (
    <section className="initialization-recipe panel">
      <h3>Initialization recipe</h3>
      <p>
        1. Verify & install the dependencies below. 2. Run these custom steps in
        order. 3. Restart the managed runtime if changed. 4. Prepare, publish
        and verify this workflow. Exporting the wrapper includes this recipe.
      </p>
      <p className="muted">
        Verified models and plugins are reused. Custom steps require private
        tokens and --allow-console; keep credentials in node configuration,
        never in a portable script.
      </p>
      <ol>
        {steps.map((step, i) => (
          <li key={i}>
            <div className="recipe-step">
              <div>
                <strong>{step.name}</strong>
                <small>
                  {step.directory || "ComfyUI root"} · {step.timeoutSeconds}s ·{" "}
                  {step.policy === "recipe"
                    ? "Once per exact recipe / runtime"
                    : "Once per runtime session"}
                </small>
              </div>
              <div className="jobs-toolbar">
                <button
                  disabled={i === 0}
                  aria-label={`Move ${step.name} up`}
                  onClick={() => {
                    const next = [...steps];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    change(next);
                  }}
                >
                  <ArrowUp size={16}/>
                </button>
                <button
                  disabled={i === steps.length - 1}
                  aria-label={`Move ${step.name} down`}
                  onClick={() => {
                    const next = [...steps];
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    change(next);
                  }}
                >
                  <ArrowDown size={16}/>
                </button>
                <button onClick={() => edit(i)}>Edit</button>
                <button onClick={() => change(steps.filter((_, n) => n !== i))}>
                  Remove step
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <button disabled={steps.length >= 32} onClick={() => edit(steps.length)}>
        Add script step
      </button>
      {editing !== null && (
        <Modal fullScreen title="Initialization step" onClose={() => setEditing(null)}>
          <Field
            label="Step name"
            value={draft.name}
            onChange={(name) => setDraft({ ...draft, name })}
          />
          <Field
            label="Working folder, relative to ComfyUI (empty = root)"
            value={draft.directory}
            onChange={(directory) => setDraft({ ...draft, directory })}
          />
          <p>Predefined paths: COMFYUI_DIR, COMFYUI_PYTHON, MODELS_DIR, CUSTOM_NODES_DIR, WORKFLOW_DIR, CACHE_DIR. Quote paths in your scripts. Checks run each time; exit 0 means installed, any other exit requests installation.</p>
          <Field label="Check script (optional)" multiline value={draft.checkScript ?? ""} onChange={checkScript=>setDraft({...draft,checkScript:checkScript||null})}/>
          <Field
            label="Install script"
            multiline
            value={draft.script}
            onChange={(script) => setDraft({ ...draft, script })}
          />
          <Field label="Verify script (optional, runs after install or reuse)" multiline value={draft.verifyScript ?? ""} onChange={verifyScript=>setDraft({...draft,verifyScript:verifyScript||null})}/>
          <Field
            label="Timeout in seconds (1–3600)"
            value={String(draft.timeoutSeconds)}
            onChange={(v) => setDraft({ ...draft, timeoutSeconds: Number(v) })}
          />
          <Picker
            title="Run policy"
            value={draft.policy}
            options={[
              {
                id: "recipe",
                label: "Once per recipe and runtime",
                description: "Changing any step invalidates the saved receipt.",
              },
              {
                id: "session",
                label: "Once per runtime session",
                description:
                  "Rerun after the agent restarts or a new notebook session.",
              },
            ]}
            onChange={(policy) =>
              setDraft({
                ...draft,
                policy: policy as InitializationStep["policy"],
              })
            }
          />
          <button
            className="primary"
            disabled={
              !draft.name.trim() ||
              !draft.script.trim() ||
              draft.timeoutSeconds < 1 ||
              draft.timeoutSeconds > 3600 ||
              !Number.isInteger(draft.timeoutSeconds) ||
              draft.directory.startsWith("/") ||
              draft.directory.split("/").includes("..") ||
              /[\\:]/.test(draft.directory)
            }
            onClick={() => {
              const next = [...steps];
              next[editing] = draft;
              change(next);
              setEditing(null);
            }}
          >
            Save step
          </button>
        </Modal>
      )}
    </section>
  );
}
