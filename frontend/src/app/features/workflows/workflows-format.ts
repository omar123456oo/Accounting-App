import { BadgeTone } from '../../shared/components/status-badge/status-badge';

export const TASK_STATUS_TONE: Record<string, BadgeTone> = { todo: 'info', in_progress: 'warning', blocked: 'danger', done: 'success', cancelled: 'secondary' };
export const PRIORITY_TONE: Record<string, BadgeTone> = { low: 'secondary', normal: 'info', high: 'warning', urgent: 'danger' };
