import express, { NextFunction, Request, Response } from 'express';
import { authRouter } from './auth/routes.js';
import { can, cookieParser, csrf, issueXsrf, loadSession, requireAuth, requireType } from './auth/session.js';
import { coreRouter } from './core/index.js';
import { dbHealthy } from './db/connection.js';
import { docsRouter } from './docs/index.js';
import { HttpError } from './hr/common.js';
import { hrRouter, leaveApiRouter, meHrRouter } from './hr/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser);

  app.get('/api/health', async (_req, res) => {
    const db = await dbHealthy();
    res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db: db ? 'up' : 'down' });
  });
  app.get('/sanctum/csrf-cookie', (_req, res) => { issueXsrf(res); res.status(204).end(); });

  app.use('/api/v1', csrf, loadSession);
  app.use('/api/v1/auth', authRouter);
  // Staff API: authenticated staff only; the tenant is always req.auth.organizationId.
  app.use('/api/v1/staff', requireAuth, requireType('staff'));
  app.get("/api/v1/staff/ping", requireAuth, requireType("staff"), can("clients.view"), (_req, res) => { res.json({ pong: true }); });

  app.use('/api/v1/staff/core', requireAuth, requireType('staff'), coreRouter);
  app.use('/api/v1/staff/docs', requireAuth, requireType('staff'), docsRouter);
  app.use('/api/v1/staff/hr', requireAuth, requireType('staff'), leaveApiRouter);
  app.use('/api/v1/staff/hrm', requireAuth, requireType('staff'), hrRouter);
  app.use('/api/v1/me/hrm', requireAuth, requireType('staff'), meHrRouter);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) { res.status(err.status).json({ message: err.message, ...(err.errors ? { errors: err.errors } : {}) }); return; }
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  });
  return app;
}
