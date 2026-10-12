export interface NavItem {
  /** Translation key for the label. */
  labelKey: string;
  route: string;
  /** When set, the item is shown only to users holding this permission. */
  permission?: string;
  /** Items sharing a group are listed together under a heading with this translation key. */
  groupKey?: string;
  /** Font Awesome icon name without the fa- prefix, shown next to the label. */
  icon?: string;
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
  { labelKey: 'nav.mappings', route: '/app/accounting/settings/mappings', permission: 'mappings.manage', groupKey: 'nav.accounting' },
  { labelKey: 'nav.taxRates', route: '/app/accounting/settings/tax-rates', permission: 'tax.rates.manage', groupKey: 'nav.accounting' },
  { labelKey: 'nav.invoices', route: '/app/invoicing/invoices', permission: 'invoices.view', groupKey: 'nav.invoicing' },
  { labelKey: 'nav.receipts', route: '/app/invoicing/payments', permission: 'invoices.view', groupKey: 'nav.invoicing' },
  { labelKey: 'nav.bills', route: '/app/payables/bills', permission: 'bills.view', groupKey: 'nav.payables' },
  { labelKey: 'nav.suppliers', route: '/app/payables/suppliers', permission: 'suppliers.manage', groupKey: 'nav.payables' },
  { labelKey: 'nav.expenses', route: '/app/payables/expenses', permission: 'expenses.claim', groupKey: 'nav.payables' },
  { labelKey: 'nav.incomeStatement', route: '/app/statements/income', permission: 'reports.view', groupKey: 'nav.statements', icon: 'chart-line' },
  { labelKey: 'nav.balanceSheet', route: '/app/statements/balance', permission: 'reports.view', groupKey: 'nav.statements', icon: 'scale-balanced' },
  { labelKey: 'nav.cashFlow', route: '/app/statements/cashflow', permission: 'reports.view', groupKey: 'nav.statements', icon: 'money-bill-transfer' },
  { labelKey: 'nav.equityChanges', route: '/app/statements/equity', permission: 'reports.view', groupKey: 'nav.statements', icon: 'landmark' },
  { labelKey: 'nav.statementMapping', route: '/app/statements/mapping', permission: 'mappings.manage', groupKey: 'nav.statements', icon: 'sitemap' },
  { labelKey: 'nav.settings', route: '/app/settings', permission: 'settings.manage' },
];
