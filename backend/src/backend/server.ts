import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

// Import services
import { setupRoutes } from './routes/index';
import { setupWebSocket } from './websocket';
import { loadAppConfig } from './config';
import { logAWSConfig, validateAWSConfig } from '../utils/aws-config';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import drcRoutes from './routes/drc';
import componentsRoutes from './routes/components';
import { authMiddleware } from './middleware/auth';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware - CORS configuration
if (NODE_ENV === 'development') {
  // In development, allow CORS with explicit headers
  app.use(cors({
    origin: '*',  // Allow all origins
    credentials: false,  // Don't use credentials with wildcard origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-user-id'],  // Explicit headers
    exposedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400  // Cache preflight for 24 hours
  }));

  // Additional headers for development
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH,HEAD');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id, x-user-id');
    res.header('Access-Control-Expose-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
} else {
  // In production, restrict to specific origin
  app.use(cors({
    origin: process.env.FRONTEND_URL || false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-user-id']
  }));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      version: '1.0.0'
    }
  });
});

// Import template routes
import templateRoutes from './routes/templates';
import cacheAdminRoutes from './routes/cache-admin';

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/drc', authMiddleware, drcRoutes);
app.use('/api/templates', authMiddleware, templateRoutes);
app.use('/api/cache', authMiddleware, cacheAdminRoutes); // Cache management (admin only)
// Note: /api/v1/components is registered in setupRoutes() with authMiddleware
app.use('/api', setupRoutes());

// WebSocket setup
setupWebSocket(wss);

// Static file serving for production
if (NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../dist/frontend')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../dist/frontend/index.html'));
  });
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: NODE_ENV === 'development' ? err.message : 'Internal server error',
      ...(NODE_ENV === 'development' && { stack: err.stack })
    },
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`
    },
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 SoC Pilot Backend Server running on port ${PORT}`);
  console.log(`📊 Environment: ${NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);

  if (NODE_ENV === 'development') {
    console.log(`🔄 Hot-reload enabled`);
    console.log(`🌐 Frontend URLs: http://localhost:5173, http://localhost:9002`);
  }
  
  // Log AWS configuration
  console.log('');
  logAWSConfig();
  
  // Validate AWS configuration
  const awsValidation = validateAWSConfig();
  if (!awsValidation.valid) {
    console.warn('⚠️  AWS Configuration Issues:');
    awsValidation.errors.forEach(err => console.warn(`   - ${err}`));
    console.warn('   Workspace features may not work correctly!');
  } else {
    console.log('✅ AWS Configuration validated');
  }
});

export default app;