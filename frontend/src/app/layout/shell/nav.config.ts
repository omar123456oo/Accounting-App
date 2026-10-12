export interface NavItem {
  /** Translation key for the label. */
  labelKey: string;
  route: string;
  /** When set, the item is shown only to users holding this permission. */
  permission?: string;
  /** Items sharing a group are listed together under a heading with this translation key. */
  groupKey?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { labelKey: 'nav.dashboard', route: '/app' },
  { labelKey: 'nav.clients', route: '/app/clients', permission: 'clients.view' },
  { labelKey: 'nav.documents', route: '/app/documents', permission: 'documents.view' },
  { labelKey: 'nav.tasks', route: '/app/tasks', permission: 'tasks.view' },
  { labelKey: 'nav.approvals', route: '/app/approvals', permission: 'workflows.approve' },
  { labelKey: 'nav.accounts', route: '/app/accounting/accounts', permission: 'ledger.view', groupKey: 'nav.accounting' },
  { labelKey: 'nav.periods', route: '/app/accounting/periods', permission: 'ledger.view', groupKey: 'nav.accounting' },
  { labelKey: 'nav.journals', route: '/app/accounting/journals', permission: 'journals.view', groupKey: 'nav.accounting' },
  { labelKey: 'nav.reports', route: '/app/accounting/reports', permission: 'reports.view', groupKey: 'nav.accounting' },
  { labelKey: 'nav.settings', route: '/app/settings', permission: 'settings.manage' },
];
