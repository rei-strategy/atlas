const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'atlas.db');

function initializeDatabase() {
  const db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create all tables
  db.exec(`
    -- Agencies (tenants)
    CREATE TABLE IF NOT EXISTS agencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      logo_url TEXT,
      primary_color TEXT DEFAULT '#1a56db',
      email_signature TEXT,
      default_commission_rate REAL,
      timezone TEXT DEFAULT 'America/New_York',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Users (internal agency staff)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'planner', 'support', 'marketing')),
      is_active INTEGER DEFAULT 1,
      notification_preferences TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(email)
    );

    -- Customers (client portal users)
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(email)
    );

    -- Clients (travel clients managed by the agency)
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      preferred_communication TEXT DEFAULT 'email',
      travel_preferences TEXT DEFAULT '{}',
      notes TEXT,
      marketing_opt_in INTEGER DEFAULT 0,
      contact_consent INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Trips
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      destination TEXT,
      description TEXT,
      stage TEXT NOT NULL DEFAULT 'inquiry' CHECK(stage IN ('inquiry', 'quoted', 'booked', 'final_payment_pending', 'traveling', 'completed', 'canceled', 'archived')),
      is_locked INTEGER DEFAULT 0,
      lock_reason TEXT,
      travel_start_date TEXT,
      travel_end_date TEXT,
      final_payment_deadline TEXT,
      insurance_cutoff_date TEXT,
      checkin_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Travelers
    CREATE TABLE IF NOT EXISTS travelers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      full_legal_name TEXT NOT NULL,
      date_of_birth TEXT,
      passport_status TEXT DEFAULT 'unknown' CHECK(passport_status IN ('yes', 'no', 'unknown')),
      passport_expiration TEXT,
      special_needs TEXT,
      relationship_to_client TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Bookings
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      booking_type TEXT NOT NULL CHECK(booking_type IN ('hotel', 'cruise', 'resort', 'tour', 'insurance', 'transfer', 'other')),
      supplier_name TEXT,
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'quoted', 'booked', 'canceled')),
      confirmation_number TEXT,
      booking_date TEXT,
      travel_start_date TEXT,
      travel_end_date TEXT,
      total_cost REAL DEFAULT 0,
      deposit_amount REAL DEFAULT 0,
      deposit_paid INTEGER DEFAULT 0,
      final_payment_amount REAL DEFAULT 0,
      final_payment_due_date TEXT,
      payment_status TEXT DEFAULT 'deposit_paid' CHECK(payment_status IN ('deposit_paid', 'final_due', 'paid_in_full')),
      commission_amount_expected REAL DEFAULT 0,
      commission_rate REAL DEFAULT 0,
      commission_status TEXT DEFAULT 'expected' CHECK(commission_status IN ('expected', 'submitted', 'paid')),
      commission_amount_received REAL,
      commission_received_date TEXT,
      commission_payment_reference TEXT,
      commission_variance_note TEXT,
      supplier_notes TEXT,
      inclusions_exclusions TEXT,
      cancellation_rules TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Tasks
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
      assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'completed', 'overdue')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'urgent')),
      category TEXT DEFAULT 'internal' CHECK(category IN ('follow_up', 'payment', 'commission', 'client_request', 'internal')),
      is_system_generated INTEGER DEFAULT 0,
      source_event TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Email Templates
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      trip_type TEXT DEFAULT 'general' CHECK(trip_type IN ('cruise', 'disney', 'general', 'all')),
      trigger_type TEXT CHECK(trigger_type IN ('stage_change', 'date_relative', 'manual')),
      trigger_config TEXT DEFAULT '{}',
      requires_approval INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Email Queue
    CREATE TABLE IF NOT EXISTS email_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
      trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'sent', 'failed')),
      scheduled_send_date TEXT,
      requires_approval INTEGER DEFAULT 0,
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_at TEXT,
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Documents
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      document_type TEXT NOT NULL CHECK(document_type IN ('contract', 'invoice', 'insurance', 'itinerary', 'confirmation', 'authorization', 'feedback', 'other')),
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      is_sensitive INTEGER DEFAULT 0,
      is_client_visible INTEGER DEFAULT 0,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Approval Requests
    CREATE TABLE IF NOT EXISTS approval_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
      reason TEXT,
      response_note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    -- Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT DEFAULT '{}',
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Trip Change Records
    CREATE TABLE IF NOT EXISTS trip_change_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      changed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      field_changed TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'normal' CHECK(type IN ('urgent', 'normal')),
      title TEXT NOT NULL,
      message TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      is_read INTEGER DEFAULT 0,
      is_dismissed INTEGER DEFAULT 0,
      snoozed_until TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Agency Settings
    CREATE TABLE IF NOT EXISTS agency_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      setting_key TEXT NOT NULL,
      setting_value TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(agency_id, setting_key)
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_clients_agency ON clients(agency_id);
    CREATE INDEX IF NOT EXISTS idx_clients_assigned ON clients(assigned_user_id);
    CREATE INDEX IF NOT EXISTS idx_trips_agency ON trips(agency_id);
    CREATE INDEX IF NOT EXISTS idx_trips_client ON trips(client_id);
    CREATE INDEX IF NOT EXISTS idx_trips_stage ON trips(stage);
    CREATE INDEX IF NOT EXISTS idx_trips_assigned ON trips(assigned_user_id);
    CREATE INDEX IF NOT EXISTS idx_travelers_trip ON travelers(trip_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_agency ON bookings(agency_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_commission_status ON bookings(commission_status);
    CREATE INDEX IF NOT EXISTS idx_tasks_agency ON tasks(agency_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_trip ON tasks(trip_id);
    CREATE INDEX IF NOT EXISTS idx_documents_trip ON documents(trip_id);
    CREATE INDEX IF NOT EXISTS idx_documents_agency ON documents(agency_id);
    CREATE INDEX IF NOT EXISTS idx_approval_requests_agency ON approval_requests(agency_id);
    CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_agency ON audit_logs(agency_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_email_queue_agency ON email_queue(agency_id);
    CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
    CREATE INDEX IF NOT EXISTS idx_customers_agency ON customers(agency_id);
    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
  `);

  console.log('Database initialized successfully at:', DB_PATH);
  db.close();
}

initializeDatabase();
