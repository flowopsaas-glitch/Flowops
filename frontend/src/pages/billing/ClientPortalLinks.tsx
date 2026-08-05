// Client Portal Links — coming soon.
// The booking-portal backend endpoints (/booking-portal/companies/:id/links)
// are not yet implemented. This stub keeps the page file present so imports
// don't break, but renders a clear "coming soon" message instead of crashing
// with a 404 API error.
export default function ClientPortalLinks() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="text-5xl mb-4">🔗</div>
      <h2 className="text-2xl font-black text-white mb-2">Client Portal Links</h2>
      <p className="text-white/50 max-w-sm">
        This feature is coming soon. Client booking portal links will allow your
        customers to self-serve collections and track their shipments directly.
      </p>
      <p className="mt-4 text-xs text-white/25">
        Contact support if you need early access.
      </p>
    </div>
  );
}
