// src/pages/NotFound.tsx
import React from "react";
import { Link } from "react-router-dom";

import { isTenantAdminFullAccess, canTenantAdminSeeNavItem, canTenantAdminAccessRoute, isHiddenOwnerPath } from '../lib/tenantAdminFullAccess';
export default function NotFound() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-extrabold text-white">404</h1>
      <p className="mt-2 text-white/70">That page doesnâ€™t exist.</p>

      <Link
        to="/dashboard"
        className="inline-flex mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 font-bold text-white/85 hover:bg-white/10"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
