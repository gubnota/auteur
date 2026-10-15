import { useState } from "react";
import {
  Search,
  Image,
  Workflow,
  Server,
  ListChecks,
  Film,
} from "lucide-react";
import type { Project, Job, Connection } from "./lib/types";
import { mediaUrl } from "./lib/bridge";
import { Modal, Field } from "./components/Controls";
type Props = {
  project: Project;
  jobs: Job[];
  connections: Connection[];
  recent: { name: string; path: string }[];
  close: () => void;
  navigate: (route: string) => void;
  useWorkflow: (id: string) => void;
  openMovie: (path: string) => void;
};
export function GlobalSearch({
  project,
  jobs,
  connections,
  recent,
  close,
  navigate,
  useWorkflow,
  openMovie,
}: Props) {
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("All");
  const assets = project.assets.filter((a) => !a.archivedAt);
  const rows = [
    ...project.workflows
      .filter((w) => !w.wrapper?.archivedAt)
      .map((w) => ({
        id: w.id,
        kind: "Workflows",
        title: w.name,
        detail: `${w.requirements?.compatibility} ${w.wrapper?.readme || ""}`,
        image: w.wrapper?.illustration || "",
        icon: Workflow,
        action: () => useWorkflow(w.id),
      })),
    ...connections.map((c) => ({
      id: c.id,
      kind: "Instances",
      title: c.name,
      detail: `${c.hosting || c.kind} ${c.url} ${c.deploymentId || ""}`,
      image: "",
      icon: Server,
      action: () => {
        navigate("Instances");
        window.setTimeout(
          () =>
            window.dispatchEvent(
              new CustomEvent("mymovie:node", { detail: c.id }),
            ),
          50,
        );
      },
    })),
    ...jobs.map((j) => ({
      id: j.id,
      kind: "Jobs",
      title:
        project.workflows.find((w) => w.id === j.workflowId)?.name ||
        "Generation",
      detail: `${j.state} ${j.id} ${j.error || ""}`,
      image: j.results[0] ? mediaUrl("", j.results[0]) : "",
      icon: ListChecks,
      action: () => navigate("Jobs"),
    })),
    ...assets.map((a) => ({
      id: a.id,
      kind: "Media",
      title: a.name,
      detail: `${a.kind} ${a.id}`,
      image: a.kind === "image" ? mediaUrl("", a) : "",
      icon: Image,
      action: () => navigate("Library"),
    })),
    ...recent.map((r) => ({
      id: r.path,
      kind: "Movies",
      title: r.name,
      detail: r.path,
      image: "",
      icon: Film,
      action: () => openMovie(r.path),
    })),
  ].filter(
    (r) =>
      (kind === "All" || kind === r.kind) &&
      query
        .toLocaleLowerCase()
        .trim()
        .split(/\s+/)
        .every((term) =>
          `${r.title} ${r.detail}`.toLocaleLowerCase().includes(term),
        ),
  );
  return (
    <Modal title="Search Studio" onClose={close}>
      <Field
        label="Search workflows, nodes, jobs, media and Movies"
        value={query}
        onChange={setQuery}
      />
      <div className="search-filters">
        {["All", "Workflows", "Instances", "Jobs", "Media", "Movies"].map(
          (k) => (
            <button
              key={k}
              className={kind === k ? "selected" : ""}
              onClick={() => setKind(k)}
            >
              {k}
            </button>
          ),
        )}
      </div>
      <small>{rows.length} results</small>
      <div className="search-results">
        {rows.slice(0, 100).map((r) => (
          <button
            className="choice"
            key={`${r.kind}:${r.id}`}
            onClick={() => {
              r.action();
              close();
            }}
          >
            {r.image ? <img src={r.image} alt="" /> : <r.icon size={24} />}
            <span>
              <strong>{r.title}</strong>
              <small>
                {r.kind} · {r.detail.slice(0, 130)}
              </small>
            </span>
          </button>
        ))}
        {rows.length === 0 && (
          <p>
            No matching resources. Import a workflow or connect a node to begin.
          </p>
        )}
      </div>
      <small>
        <Search size={14} /> Command K opens search from any workspace.
      </small>
    </Modal>
  );
}
