const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('TestPass123', 10);
process.stdout.write(hash);
