import { Badge } from "@/src/components/ui/badge";
import { useState, useEffect } from "react";
import { apiGet, apiPost } from "../../api/client";

export function TopBar() {
  const [isDryRun, setIsDryRun] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    apiGet<{ dryRun: boolean }>("/config")
      .then((cfg) => { setIsDryRun(cfg.dryRun); setConnected(true); })
      .catch(() => setConnected(false));
  }, []);

  const toggleDryRun = async () => {
    const next = !isDryRun;
    try {
      await apiPost("/config/dry-run", { dryRun: next });
      setIsDryRun(next);
    } catch { /* stay on current state */ }
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-semibold text-zinc-100">Trading Terminal</h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}></div>
          {connected ? "Connected" : "Disconnected"}
        </div>
        <button onClick={toggleDryRun}>
          {isDryRun ? (
            <Badge variant="warning" className="cursor-pointer">DRY RUN</Badge>
          ) : (
            <Badge variant="success" className="cursor-pointer">LIVE</Badge>
          )}
        </button>
      </div>
    </header>
  );
}
