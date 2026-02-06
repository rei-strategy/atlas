// Migration: Add workflow timing fields to agencies table
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'atlas.db');
const db = new Database(DB_PATH);

console.log('Running migration: Add workflow timing fields to agencies table...');

try {
  // Check if columns already exist
  const tableInfo = db.prepare("PRAGMA table_info(agencies)").all();
  const columnNames = tableInfo.map(col => col.name);

  const columnsToAdd = [
    { name: 'deadline_reminder_days', type: 'INTEGER DEFAULT 7' },
    { name: 'quote_followup_days', type: 'INTEGER DEFAULT 3' },
    { name: 'booking_confirmation_days', type: 'INTEGER DEFAULT 1' },
    { name: 'final_payment_reminder_days', type: 'INTEGER DEFAULT 7' },
    { name: 'travel_reminder_days', type: 'INTEGER DEFAULT 0' },
    { name: 'feedback_request_days', type: 'INTEGER DEFAULT 3' }
  ];

  for (const col of columnsToAdd) {
    if (!columnNames.includes(col.name)) {
      db.exec(`ALTER TABLE agencies ADD COLUMN ${col.name} ${col.type}`);
      console.log(`  Added column: ${col.name}`);
    } else {
      console.log(`  Column already exists: ${col.name}`);
    }
  }

  console.log('Migration completed successfully!');
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
