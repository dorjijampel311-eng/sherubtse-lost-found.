const path = require('path');
// Resolve the private .env from this project, regardless of the launch directory.
// Existing process variables (including Render settings) retain precedence.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
