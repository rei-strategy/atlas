import React from 'react';

export default function ReportsPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">View reports and analytics.</p>
      </div>
      <div className="dashboard-card">
        <div className="dashboard-card-body">
          <p className="dashboard-empty-state">Reports will be available once you have trip and booking data.</p>
        </div>
      </div>
    </div>
  );
}
