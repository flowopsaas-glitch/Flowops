import React from "react";
import DriverDashboard from "./driver/DriverDashboard";

import { isTenantAdminFullAccess, canTenantAdminSeeNavItem, canTenantAdminAccessRoute, isHiddenOwnerPath } from '../lib/tenantAdminFullAccess';
export default function DriverApp() {
  return <DriverDashboard />;
}
