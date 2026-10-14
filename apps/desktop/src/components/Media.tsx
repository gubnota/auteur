import { useState, useEffect } from "react";
import type { Asset } from "../lib/types";
import { call, mediaUrl, posterUrl, native } from "../lib/bridge";
export function Media({
  asset,
  root,
  thumbnail = false,
}: {
  asset: Asset;
  root: string;
  thumbnail?: boolean;
}) {
  const [poster, setPoster] = useState(false),
    [previewError, setPreviewError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let stopped = false;
    setPoster(false);
    setPreviewError("");
    if (asset.kind === "video" && native)
      void call<boolean>("video_thumbnail", { assetId: asset.id })
        .then((v) => {
          if (!stopped) setPoster(v);
        })
        .catch((e) => {
          if (!stopped) setPreviewError(String(e));
        });
    return () => {
      stopped = true;
    };
  }, [root, asset.id, asset.sha256, retry]);
  if (
    !mediaUrl(root, asset) &&
    ["image", "video", "audio"].includes(asset.kind)
  ) {
    return (
      <div className="file-placeholder">
        {asset.kind} · {asset.name}
      </div>
    );
  }
  return asset.kind === "video" ? (
    <div className="video-preview">
      <video
        controls={!thumbnail}
        tabIndex={thumbnail ? -1 : undefined}
        preload="metadata"
        poster={poster ? posterUrl(asset) : undefined}
        src={mediaUrl(root, asset)}
      />
      {previewError && !thumbnail && (
        <button
          className="text-button"
          title={previewError}
          onClick={() => setRetry((v) => v + 1)}
        >
          Preview unavailable · retry
        </button>
      )}
    </div>
  ) : asset.kind === "audio" ? (
    thumbnail ? (
      <div className="file-placeholder">Audio · {asset.name}</div>
    ) : (
      <audio controls src={mediaUrl(root, asset)} />
    )
  ) : asset.kind === "image" ? (
    <img src={mediaUrl(root, asset)} alt={asset.name} />
  ) : (
    <div className="file-placeholder">LoRA · {asset.name}</div>
  );
}
