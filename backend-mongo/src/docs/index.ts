import { Router } from 'express';
import { configRouter } from './config.routes.js';
import { documentsRouter } from './documents.routes.js';
import { remindersRouter } from './reminders.routes.js';

/** Mounted at /api/v1/staff/docs (staff only; every route adds its own permission). */
export const docsRouter = Router();
docsRouter.use(configRouter, documentsRouter, remindersRouter);
