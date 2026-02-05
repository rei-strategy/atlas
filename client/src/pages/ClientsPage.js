import React from 'react';

export default function ClientsPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Clients</h1>
        <p className="page-subtitle">Manage your clients and their information.</p>
      </div>
      <div className="dashboard-card">
        <div className="dashboard-card-body">
          <p className="dashboard-empty-state">No clients yet. Add your first client to get started.</p>
        </div>
      </div>
    </div>
  );
}
