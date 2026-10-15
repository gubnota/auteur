import { useState } from "react";
import { Download } from "lucide-react";
import { version } from "../../package.json";
import { call, exportDestination } from "../lib/bridge";

export function NotebookDownload({ host }: { host: "colab" | "kaggle" }) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <div className="col">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setNotice("");
          try {
            const path = await exportDestination(
              `MyMovie_ComfyUI_${host}_${version}.ipynb`,
              "ipynb",
            );
            if (path) {
              await call("export_notebook", { host, path });
              setNotice(
                "Saved. Upload this notebook to a fresh session and choose Run all. CPU and GPU are detected automatically.",
              );
            }
          } catch (e) {
            setNotice(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={16} />
        {busy
          ? "Saving notebook…"
          : `Save ${host === "colab" ? "Colab" : "Kaggle"} notebook · ${version}`}
      </button>
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
