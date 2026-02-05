var Database = require('better-sqlite3');
var db = new Database('/Users/georgesmacbook/atlas/server/atlas.db');
var trips = db.prepare('SELECT id, agency_id, name FROM trips').all();
console.log('TRIPS:', JSON.stringify(trips));
var docs = db.prepare('SELECT id, trip_id, agency_id, file_name, document_type FROM documents').all();
console.log('DOCS:', JSON.stringify(docs));
db.close();
