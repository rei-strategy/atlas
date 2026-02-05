const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'atlas.db'));
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Tables in database:');
tables.forEach(t => console.log('  -', t.name));

// Check expected tables
const expected = ['agencies', 'users', 'customers', 'clients', 'trips', 'travelers', 'bookings', 'tasks', 'email_templates', 'email_queue', 'documents', 'approval_requests', 'audit_logs', 'trip_change_records', 'notifications', 'agency_settings'];
const actual = tables.map(t => t.name);
const missing = expected.filter(t => !actual.includes(t));

if (missing.length > 0) {
  console.log('\nMISSING TABLES:', missing);
  process.exit(1);
} else {
  console.log('\nAll expected tables exist!');
}

db.close();
