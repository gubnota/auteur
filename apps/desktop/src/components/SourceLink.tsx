import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { call, native } from "../lib/bridge";

export function SourceLink({ source }: { source?: string }) {
  const [error, setError] = useState("");
  if (!source?.startsWith("https://")) return null;
  return (
    <>
      <button
        className="source-link"
        title={source}
        onClick={() => {
          if (native)
            void call("open_external_url", { url: source }).catch(() =>
              setError("Unable to open source in your browser."),
            );
          else window.open(source, "_blank", "noopener,noreferrer");
        }}
      >
        <ExternalLink size={16} />
        Open source
      </button>
      {error && <small role="alert">{error}</small>}
    </>
  );
}
