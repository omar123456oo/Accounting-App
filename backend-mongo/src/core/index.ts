import { Router } from 'express';
import { customizeRouter } from './customize.routes.js';
import { metaRouter } from './meta.routes.js';
import { searchRouter } from './search.routes.js';

/** Mounted at /api/v1/staff/core (staff only; write routes add their own permission). */
export const coreRouter = Router();
coreRouter.use(metaRouter, customizeRouter, searchRouter);
