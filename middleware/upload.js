const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1, fields: 10, fieldSize: 1200, parts: 12 } });
module.exports = upload;
