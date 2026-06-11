import React from 'react';
import { DynamicDashboard } from '../components/DynamicDashboard';

// ✅ FIXED: No WidthProvider needed in react-grid-layout v2.x
const Dashboard = () => {
  return <DynamicDashboard />;
};

export default Dashboard;
