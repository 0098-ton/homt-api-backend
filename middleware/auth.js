import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Authentication failed' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  // In production, validate against stored API keys in database
  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
};
