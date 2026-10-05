import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import './config/env.js';
import api from './routes/index.js';
import { errorHandler, notFound } from './middleware/errors.js';

const app = express();
app.set('trust proxy', 1);            // Vercel sits behind a proxy
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const origins = (process.env.CLIENT_URL || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true, credentials: false }));
app.use(express.json({ limit: '3mb' })); // avatars/ad banners are resized in the browser first (Vercel body cap is 4.5 MB)

// Coarse protection. (In-memory per serverless instance — add Upstash/Vercel WAF rules for hard limits.)
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));

app.use('/api', api);
app.use(notFound);
app.use(errorHandler);

export default app;
