import React from 'react';

export default function DashboardPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Here's your overview for today.</p>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3>Active Trips</h3>
          </div>
          <div className="dashboard-card-body">
            <p className="dashboard-empty-state">No active trips yet. Create your first client and trip to get started.</p>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3>Today's Tasks</h3>
          </div>
          <div className="dashboard-card-body">
            <p className="dashboard-empty-state">No tasks for today. Tasks will appear here as you manage trips.</p>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3>Upcoming Deadlines</h3>
          </div>
          <div className="dashboard-card-body">
            <p className="dashboard-empty-state">No upcoming deadlines. Deadlines will appear when trips have payment or travel dates.</p>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3>Commission Pipeline</h3>
          </div>
          <div className="dashboard-card-body">
            <p className="dashboard-empty-state">No commissions tracked yet. Commission data will appear as bookings are created.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
