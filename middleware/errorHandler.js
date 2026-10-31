const multer = require('multer');
module.exports = (error, req, res, next) => {
  if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 2 MB or smaller.' : 'The photo upload is invalid.' });
  console.error('Request failed:', error.message);
  res.status(500).json({ error: 'The server could not complete that request. Please try again.' });
};
