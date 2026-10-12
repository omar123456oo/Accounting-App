export interface NavItem {
  /** Translation key for the label. */
  labelKey: string;
  route: string;
  /** When set, the item is shown only to users holding this permission. */
  permission?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { labelKey: 'nav.dashboard', route: '/app' },
  { labelKey: 'nav.clients', route: '/app/clients', permission: 'clients.view' },
  { labelKey: 'nav.documents', route: '/app/documents', permission: 'documents.view' },
  { labelKey: 'nav.tasks', route: '/app/tasks', permission: 'tasks.view' },
  { labelKey: 'nav.approvals', route: '/app/approvals', permission: 'workflows.approve' },
  { labelKey: 'nav.journals', route: '/app/journals', permission: 'journals.view' },
  { labelKey: 'nav.reports', route: '/app/reports', permission: 'reports.view' },
  { labelKey: 'nav.settings', route: '/app/settings', permission: 'settings.manage' },
];
