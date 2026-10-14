import { Router } from 'express';
import { contractRouter, meContractRouter } from './contract.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { employeeRouter, meRouter } from './employee.routes.js';
import { leaveRouter } from './leave.routes.js';
import { orgRouter } from './org.routes.js';

/** Mounted at /api/v1/staff/hrm (staff only; each route adds its own permission). */
export const hrRouter = Router();
hrRouter.use(dashboardRouter, orgRouter, employeeRouter, contractRouter);

/** Mounted at /api/v1/me/hrm: the caller's own records only. */
export const meHrRouter = Router();
meHrRouter.use(meRouter, meContractRouter);

/** Leave, as the existing screens expect it: mounted at /api/v1/staff/hr. */
export const leaveApiRouter = leaveRouter;
