import React from "react";

export default function AiWorkflow() {
  return (
    <div className="p-6">
      <div className="text-xl font-semibold">AI Workflow</div>
      <div className="text-sm text-gray-500">
        This page is installer-safe. We can wire the full workflow editor after packaging is stable.
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-gray-700">
          ✅ Build-safe placeholder • No server-side Prisma in frontend
        </div>
      </div>
    </div>
  );
}
