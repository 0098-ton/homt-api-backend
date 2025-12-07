import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: 'Too Many Attempts',
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const createUserLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    error: 'User Creation Limit',
    message: 'Too many users created from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

