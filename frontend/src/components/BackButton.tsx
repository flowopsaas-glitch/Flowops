import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Reusable back/exit control for standalone pages that would otherwise be
 * navigation dead-ends (public tracking, rating, booking, etc.). Goes back in
 * history when possible, otherwise falls back to `to` (default the dashboard),
 * so users never have to close the whole tab to escape a page.
 */
export default function BackButton({
  to = "/dashboard",
  label = "Back",
  className = "",
}: {
  to?: string;
  label?: string;
  className?: string;
}) {
  const navigate = useNavigate();

  const handleClick = () => {
    // Use real history when there is a prior entry in this SPA session.
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(to);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      className={`inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
