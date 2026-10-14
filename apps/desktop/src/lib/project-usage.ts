import type { Project } from "./types";
export interface FrameLocation {
  episodeId: string;
  sceneId: string;
  frameId: string;
  label: string;
}
export interface FrameUsage extends FrameLocation {
  assetId: string | null;
  characterIds: string[];
}
export function frameUsage(p: Project): FrameUsage[] {
  return p.episodes.flatMap((e) =>
    e.scenes.flatMap((s) =>
      s.shots.flatMap((sh) =>
        sh.frames.map((f) => ({
          episodeId: e.id,
          sceneId: s.id,
          frameId: f.id,
          label: `${e.name} / ${s.name} / ${sh.name} / ${f.name}`,
          assetId: f.assetId,
          characterIds: [
            ...new Set([...(s.characterIds ?? []), ...f.characterIds]),
          ],
        })),
      ),
    ),
  );
}
export function characterUsage(p: Project, id: string) {
  return frameUsage(p).filter((f) => f.characterIds.includes(id));
}
export function assetUsage(p: Project, id: string) {
  const cast = p.characters
    .filter((c) => c.assetIds.includes(id))
    .map((c) => c.id);
  return {
    frames: frameUsage(p)
      .filter(
        (f) => f.assetId === id || f.characterIds.some((c) => cast.includes(c)),
      )
      .map((f) => ({
        ...f,
        kind:
          f.assetId === id ? "Frame image" : "Character reference available",
      })),
    drafts: (p.jobDrafts ?? [])
      .filter((d) =>
        d.items.some((i) => Object.values(i.assets).flat().includes(id)),
      )
      .map((d) => d.name),
  };
}
