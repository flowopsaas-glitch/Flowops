import { Link } from "react-router-dom";

/**
 * 404 — shown when an authenticated user navigates to an unknown route.
 * Unauthenticated users hitting unknown routes are sent to the landing page
 * by the ProtectedRoute guard, so they never see this page unless logged in.
 */
export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <div className="text-7xl mb-6 select-none">404</div>
      <h1 className="text-3xl font-black text-white mb-3">Page not found</h1>
      <p className="text-white/50 max-w-sm mb-8">
        The page you're looking for doesn't exist or may have been moved.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-6 py-3 text-sm font-black text-white hover:bg-sky-400 transition-colors"
        >
          Go to Dashboard
        </Link>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-black text-white hover:bg-white/10 transition-colors"
        >
          Go back
        </button>
      </div>
    </div>
  );
}
