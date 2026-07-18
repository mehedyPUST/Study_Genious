import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middlewares/errorHandler';
import { env } from './config/env';
import authRoutes from './modules/auth/auth.routes';
import plansRoutes from './modules/plans/plans.routes';
import aiRoutes from './modules/ai/ai.routes';
import recommendationsRoutes from './modules/recommendations/recommendations.routes';
import interactionsRoutes from './modules/interactions/interactions.routes';
import profileRoutes from './modules/profile/profile.routes';

export function createApp() {
    const app = express();

    app.use(helmet());
    app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
    app.use(express.json());

    app.get('/', (_req, res) => {
        res.json({ success: true, message: 'Welcome to StudyGenius API. Use /api/...' });
    });


    app.get('/api/health', (_req, res) => {
        res.json({ success: true, message: 'StudyGenius API is running' });
    });

    app.use('/api/auth', authRoutes);
    app.use('/api/plans', plansRoutes);
    app.use('/api/ai', aiRoutes);
    app.use('/api/recommendations', recommendationsRoutes);
    app.use('/api/interactions', interactionsRoutes);
    app.use('/api/profile', profileRoutes);

    app.use(errorHandler);
    return app;
}