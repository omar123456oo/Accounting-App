export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface TaskComment {
  id: string;
  author: string;
  body: string;
  at: string;
}

export interface TaskEvent {
  actor: string;
  action: 'created' | 'updated' | 'status_changed' | 'reassigned' | 'commented';
  from?: string;
  to?: string;
  reason?: string;
  at: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  clientId?: string;
  clientName?: string;
  assigneeId: string;
  assigneeName: string;
  priority: TaskPriority;
  /** Business date, YYYY-MM-DD. */
  dueDate: string;
  status: TaskStatus;
  dependsOnTaskIds: string[];
  comments: TaskComment[];
  history: TaskEvent[];
  /** Computed by the server: not finished and past its due date. */
  overdue: boolean;
}

export interface TaskInput {
  title: string;
  description?: string;
  clientId?: string;
  assigneeId: string;
  priority: TaskPriority;
  dueDate: string;
  status?: TaskStatus;
  dependsOnTaskIds: string[];
}

export interface TaskListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  mine?: boolean;
  clientId?: string;
  /** A single status, or "open" for todo, in progress and blocked. */
  status?: TaskStatus | 'open' | '';
  priority?: TaskPriority | '';
  overdue?: boolean;
  sort?: string;
  dir?: 'asc' | 'desc';
}

export type ApprovalKind = 'onboarding';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  clientId: string;
  clientName: string;
  requestedBy: string;
  requestedById: string;
  requestedAt: string;
  status: ApprovalStatus;
  decidedBy?: string;
  decidedAt?: string;
  comment?: string;
}
