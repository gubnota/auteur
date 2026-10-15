import { useEffect, useState } from "react";
import { call, native } from "../lib/bridge";
import type { Connection } from "../lib/types";
type Sample = {
  sampledAt: number;
  cpuPercent: number | null;
  ramUsedBytes: number | null;
  ramTotalBytes: number | null;
  memoryKind: string;
  gpus: {
    index: number;
    name: string;
    percent: number;
    usedBytes: number;
    totalBytes: number;
  }[];
};
const gib = (n: number | null | undefined) =>
  n == null ? "unavailable" : `${(n / 1073741824).toFixed(1)} GB`;
export function NodeMetrics({ connection }: { connection: Connection }) {
  const [health, setHealth] = useState<{
      metrics?: Sample;
      lastSeen?: number;
      connected?: boolean;
    } | null>(null),
    [ping, setPing] = useState<number | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      busy = false;
    const tick = async () => {
      if (busy || !native) return;
      busy = true;
      const start = performance.now();
      try {
        const next = await call<typeof health>("connection_health", {
          connectionId: connection.id,
          passive: true,
        });
        if (alive) {
          setHealth(next);
          setPing(Math.round(performance.now() - start));
          setError("");
        }
      } catch {
        if (alive) setError("Check connection to start monitoring");
      } finally {
        busy = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [connection.id, connection.url, connection.deploymentId]);
  const m = health?.metrics;
  const stale = m && Date.now() / 1000 - m.sampledAt > 45;
  return (
    <div className="node-metrics" aria-label={`${connection.name} monitoring`}>
      <small>
        {error ||
          (stale
            ? "Stale sample"
            : ping !== null
              ? `${ping} ms round trip`
              : "Monitoring available in desktop app")}
      </small>
      {m ? (
        <>
          <span>
            CPU{" "}
            {m.cpuPercent == null
              ? "unavailable"
              : `${m.cpuPercent.toFixed(1)}%`}
          </span>
          <span>
            {m.memoryKind}: {gib(m.ramUsedBytes)} / {gib(m.ramTotalBytes)}
          </span>
          {m.gpus.map((g) => (
            <span key={g.index}>
              {g.name}: {g.percent}% · VRAM {gib(g.usedBytes)} /{" "}
              {gib(g.totalBytes)}
            </span>
          ))}
          <small>
            Sample {new Date(m.sampledAt * 1000).toLocaleTimeString()}
          </small>
        </>
      ) : (
        <small>CPU / RAM / GPU details require a current agent.</small>
      )}
    </div>
  );
}
