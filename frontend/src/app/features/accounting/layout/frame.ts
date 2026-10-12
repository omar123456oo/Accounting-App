/**
 * What the shared ledger frame shows for one section: where its pages live, the tabs the user may see, and
 * which URLs are a single record's page (so changing the ledger leaves that page for the section's list).
 */
export interface FrameTab {
  key: string;
  /** The user needs this permission, or any one of them when it is a list. */
  permission: string | readonly string[];
}

export interface FrameConfig {
  base: string;
  /** Translation key of the navigation landmark. */
  sectionsKey: string;
  /** Prefix of the tab label keys. */
  tabPrefix: string;
  tabs: readonly FrameTab[];
  /** Matches `/<tab>/<id>` URLs of a single record; group 1 is the tab to return to. */
  recordPattern: string;
}

export const ACCOUNTING_FRAME: FrameConfig = {
  base: '/app/accounting',
  sectionsKey: 'accounting.sections',
  tabPrefix: 'accounting.tabs.',
  tabs: [
    { key: 'accounts', permission: 'ledger.view' },
    { key: 'periods', permission: 'ledger.view' },
    { key: 'journals', permission: 'journals.view' },
    { key: 'reports', permission: 'reports.view' },
    { key: 'settings', permission: ['mappings.manage', 'tax.rates.manage'] },
  ],
  recordPattern: '/(journals)/[^/?]+',
};
