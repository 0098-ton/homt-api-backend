import { logger } from './logger.js';

export const errorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: Object.values(err.errors).map(e => e.message),
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(409).json({
      error: 'Duplicate Entry',
      message: 'A record with this value already exists',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid Token',
      message: 'The provided token is invalid',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token Expired',
      message: 'The provided token has expired',
    });
  }

  // gRPC errors
  if (err.code && err.code >= 1 && err.code <= 16) {
    return res.status(503).json({
      error: 'Service Error',
      message: 'Unable to communicate with VPN server',
      details: err.message,
    });
  }

  // Default error
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'Something went wrong',
  });
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
};

