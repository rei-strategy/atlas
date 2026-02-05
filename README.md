# Atlas - Travel Agency Management Platform

Atlas is a centralized platform for travel planners to manage clients, trips, bookings, payments, and commissions in one place. It replaces disconnected tools and spreadsheets with a single system of record.

## Overview

Atlas consolidates trip lifecycle management, automated communications, commission tracking, task generation, and client-facing portals into one platform. It is multi-tenant, supporting independent agencies and planners with strict data isolation.

## Tech Stack

- **Frontend:** React, React Router, CSS Modules
- **Backend:** Node.js, Express
- **Database:** SQLite (via better-sqlite3)
- **Authentication:** JWT-based with role encoding
- **API:** REST

## Getting Started

### Prerequisites

- Node.js v18+
- npm
- Git

### Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd atlas

# Run the setup and start script
./init.sh
```

This will:
1. Install all dependencies (server + client)
2. Initialize the SQLite database with schema
3. Start the backend server on port 3001
4. Start the frontend dev server on port 3000

### Manual Setup

```bash
# Install server dependencies
cd server && npm install

# Initialize the database
npm run init-db

# Start the server
npm start

# In a new terminal, install client dependencies
cd client && npm install

# Start the client
npm start
```

### Access Points

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Health Check:** http://localhost:3001/api/health

## Project Structure

```
atlas/
  server/
    src/
      config/       # Database configuration and initialization
      middleware/    # Auth, tenant isolation, validation
      models/       # Data access layer
      routes/       # API route handlers
      utils/        # Shared utilities
    uploads/        # File upload storage
    atlas.db        # SQLite database (auto-created)
  client/
    public/         # Static assets
    src/
      components/   # Reusable UI components
      pages/        # Page-level components
      context/      # React context providers
      hooks/        # Custom React hooks
      utils/        # Frontend utilities
      styles/       # Global styles and design tokens
```

## User Roles

| Role | Description |
|------|-------------|
| **Admin** | Full control: approvals, settings, user management |
| **Planner/Advisor** | Day-to-day client and trip operations |
| **Support** | Limited: view data, complete tasks, upload docs |
| **Marketing** | Campaign access, client lists (with consent) |
| **Customer** | Portal access: view own trips, submit forms |

## Key Features

- **Client Management** - Full profiles, preferences, notes, consent tracking
- **Trip Lifecycle** - Inquiry through completion with stage-driven automation
- **Booking Management** - Financial tracking, supplier details, confirmation numbers
- **Commission Tracking** - Expected/submitted/paid workflow with variance detection
- **Task System** - Auto-generated from stages and deadlines, manual creation
- **Automated Emails** - Template-based triggers with approval workflows
- **Customer Portal** - Client-facing view for trip info, documents, forms
- **Dashboard** - Real-time metrics, at-risk payments, upcoming deadlines
- **Reports** - Commission, revenue, conversion, and activity reports
- **Audit Logging** - Complete trail of all significant actions

## Philosophy

Atlas tracks, organizes, reminds, and supports human decision-making. It is not a booking engine, payment processor, or accounting system. The system assumes planners are busy, interrupted, and human - it remembers things so they don't have to.
