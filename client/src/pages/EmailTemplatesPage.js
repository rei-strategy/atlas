import React from 'react';

export default function EmailTemplatesPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Email Templates</h1>
        <p className="page-subtitle">Manage automated email templates.</p>
      </div>
      <div className="dashboard-card">
        <div className="dashboard-card-body">
          <p className="dashboard-empty-state">No email templates yet. Create templates to automate communications.</p>
        </div>
      </div>
    </div>
  );
}
