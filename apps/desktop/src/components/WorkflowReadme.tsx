import type { Workflow } from "../lib/types";
import { SourceLink } from "./SourceLink";
// Render a small Markdown subset as React text. HTML/scripts and remote tracking images are never interpreted.
export function WorkflowReadme({ workflow: w }: { workflow: Workflow }) {
  return (
    <article className="workflow-guide">
      {w.wrapper?.illustration && (
        <img
          className="workflow-cover"
          src={w.wrapper.illustration}
          alt={`${w.name} guide illustration`}
        />
      )}
      {!!w.wrapper?.sampleMedia?.length && <div className="dependency-grid">{w.wrapper.sampleMedia.map(sample => <figure className="panel" key={`${sample.nodeId}.${sample.input}`}><img style={{width:"100%",maxHeight:"12rem",objectFit:"contain"}} src={sample.image} alt={sample.label}/><figcaption>{sample.label}</figcaption><small>Demo input · replace in Generate</small></figure>)}</div>}
      {w.wrapper?.readme ? (
        w.wrapper.readme.split("\n").map((line, n) => {
          if (line.startsWith("### ")) return <h3 key={n}>{line.slice(4)}</h3>;
          if (line.startsWith("## ")) return <h2 key={n}>{line.slice(3)}</h2>;
          if (line.startsWith("# ")) return <h2 key={n}>{line.slice(2)}</h2>;
          if (line.startsWith("- "))
            return (
              <p className="guide-list-item" key={n}>
                • {line.slice(2)}
              </p>
            );
          return <p key={n}>{line || "\u00a0"}</p>;
        })
      ) : (
        <p className="muted">
          Add a guide explaining what this variant does, recommended media, and
          its dependencies.
        </p>
      )}
      <h3>Dependencies · {w.requirements?.artifacts.length ?? 0}</h3>
      <div className="dependency-grid">
        {w.requirements?.artifacts.map((a, n) => (
          <article className="panel" key={n}>
            <strong>{a.target}</strong>
            <span>
              {a.kind} ·{" "}
              {a.category ||
                (a.kind === "wheel" ? "Python environment" : "custom_nodes")}
            </span>
            <small>
              {a.kind === "model"
                ? `models/${a.category}/${a.target}`
                : a.kind === "wheel"
                  ? `.mymovie-wheels/${a.target}`
                  : `custom_nodes/${a.target}`}
            </small>
            <code>{a.sha256.slice(0, 16)}</code>
            {a.source?.startsWith("https://") ? (
              <SourceLink source={a.source}/>
            ) : (
              <span>Private source · configure on node</span>
            )}
            <small>{a.license}</small>
          </article>
        ))}
      </div>
    </article>
  );
}
