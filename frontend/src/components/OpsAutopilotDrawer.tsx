import React, { useMemo, useState } from "react";

type Action = { id: string; label: string };
type Plan = { name: string; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; score: number; actions: Action[] };

export default function OpsAutopilotDrawer() {
  // In your real app this comes from API/state. Here we keep build safe.
  const [open, setOpen] = useState(false);

  const plan: Plan | null = useMemo(() => {
    return {
      name: "Ops Autopilot",
      severity: "HIGH",
      score: 86,
      actions: [
        { id: "notify", label: "Notify client proactively" },
        { id: "reroute", label: "Suggest alternative route" },
        { id: "driver", label: "Ping driver for status" },
      ],
    };
  }, []);

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  if (!plan) return null;

  const chosen = plan.actions.filter((a) => selected[a.id] || plan.severity === "CRITICAL");

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Ops Autopilot</div>
          <div className="text-sm text-gray-500">AI assisted ops actions</div>
        </div>

        <button
          className="rounded-xl bg-black px-3 py-2 text-sm text-white"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Open"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-gray-50 p-3 text-sm">
            <div className="font-medium">{plan.name}</div>
            <div className="text-gray-600">Severity: {plan.severity} • Score: {plan.score}</div>
          </div>

          <div className="space-y-2">
            {plan.actions.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!selected[a.id]}
                  onChange={(e) => setSelected((s) => ({ ...s, [a.id]: e.target.checked }))}
                />
                {a.label}
              </label>
            ))}
          </div>

          <div className="text-sm text-gray-700">
            Chosen: {chosen.length ? chosen.map((x) => x.label).join(", ") : "None"}
          </div>
        </div>
      )}
    </div>
  );
}
