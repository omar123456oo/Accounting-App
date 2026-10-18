export type Op = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
export const OPS: readonly Op[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in'];

export interface WorkflowState { name: string; label: string; editable: boolean }
export interface Condition { field: string; op: Op; value: unknown }
export interface Transition {
  from: string; to: string; action: string; label: string;
  allowedRoles: string[]; allowedUsers: string[];
  approvals: number; requireComment: boolean; preventSelfApproval: boolean; conditions: Condition[];
}
export interface Escalation { state: string; afterHours: number; notifyRoles: string[]; notifyUsers: string[]; remindApprovers: boolean }
export interface WorkflowDefinition {
  name: string; active: boolean; initialState: string;
  states: WorkflowState[]; transitions: Transition[]; escalations: Escalation[];
}

export interface WorkflowAction { action: string; label: string; requireComment: boolean }
export interface WorkflowHistoryItem {
  at: string; actor: string | null; actorName: string | null; action: string; from: string | null; to: string | null; comment: string | null; onBehalfOf: string | null;
}
/** What the server says about one record's workflow, worked out for the signed-in person. */
export interface WorkflowBlock { state: string; stateLabel: string; editable: boolean; actions: WorkflowAction[]; history: WorkflowHistoryItem[] }

export interface Person { id: string; name: string }
export interface DirectoryUser { id: string; name: string; roles: string[] }
export interface Directory { roles: string[]; users: DirectoryUser[] }

export interface InboxItem {
  doctype: string; doctypeLabel: string; name: string; title: string; state: string; stateLabel?: string;
  actions: WorkflowAction[]; since: string; route: string;
}
export interface Delegation { id: string; toUserId: string; toName: string | null; startDate: string; endDate: string }
export interface AppNotification { id: string; kind: 'workflow' | 'escalation' | 'document_reminder' | 'document'; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }
