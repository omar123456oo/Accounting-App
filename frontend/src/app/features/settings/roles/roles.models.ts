export interface Role {
  id: string;
  name: string;
  description: string;
  /** Built-in roles cannot be renamed or deleted; their permissions can be adjusted. */
  system: boolean;
  /** The Owner role always holds every permission and cannot be edited. */
  locked: boolean;
  permissions: string[];
  userCount: number;
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: string[];
}

export interface PermissionAction {
  /** Full permission key, e.g. "journals.approve". */
  key: string;
  /** The part after the module, e.g. "approve" or "rates.manage". */
  action: string;
}

export interface PermissionModule {
  module: string;
  actions: PermissionAction[];
}

export interface StaffUserRoles {
  id: string;
  name: string;
  email: string;
  roleIds: string[];
  permissionCount: number;
}

/** Translation key of a permission module label. */
export const moduleLabelKey = (module: string): string => `roles.module.${module}`;
/** Translation key of a permission action label (dots become underscores so the key stays flat). */
export const actionLabelKey = (action: string): string => `roles.action.${action.replace(/\./g, '_')}`;
