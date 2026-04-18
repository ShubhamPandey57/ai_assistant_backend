const { v4: uuidv4 } = require('uuid');

const errorHandler = (err, req, res, next) => {
  const requestId = uuidv4();
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[${new Date().toISOString()}] [ERROR] [${requestId}] ${status} - ${message}`);
  if (err.stack) console.error(err.stack);

  res.status(status).json({
    status,
    message,
    requestId,
    timestamp: new Date().toISOString(),
  });
};

module.exports = errorHandler;
