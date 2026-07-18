import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './modules/auth/auth.routes';
import plansRoutes from './modules/plans/plans.routes';
import profileRoutes from './modules/profile/profile.routes';
import recommendationRoutes from './modules/recommendations/recommendations.routes';
import interactionRoutes from './modules/interactions/interactions.routes';
import aiRoutes from './modules/ai/ai.routes';
import { errorHandler } from './middlewares/errorHandler';

const ALLOWED_ORIGINS = [
  'https://studygenious-frontend.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS – explicitly list allowed origins
  app.use(
    cors({
      origin(origin, callback) {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Explicitly handle preflight for every route
  app.options('*', cors());

  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ success: true, message: 'StudyGenius API is running' }));

  // Modular routes
  app.use('/api/auth', authRoutes);
  app.use('/api/plans', plansRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/recommendations', recommendationRoutes);
  app.use('/api/interactions', interactionRoutes);
  app.use('/api/ai', aiRoutes);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
