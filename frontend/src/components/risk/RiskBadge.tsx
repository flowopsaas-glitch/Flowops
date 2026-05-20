import React from "react";

function getLabel(score: number) {
  if (score >= 75) return "HIGH RISK";
  if (score >= 40) return "MED RISK";
  return "LOW RISK";
}

function getStyle(score: number): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    display: "inline-block",
    border: "1px solid transparent",
  };

  if (score >= 75) return { ...base, background: "#fee2e2", color: "#991b1b", borderColor: "#fecaca" };
  if (score >= 40) return { ...base, background: "#ffedd5", color: "#9a3412", borderColor: "#fed7aa" };
  return { ...base, background: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" };
}

export default function RiskBadge({ score }: { score: number }) {
  return <span style={getStyle(score)}>{getLabel(score)} · {score}</span>;
}