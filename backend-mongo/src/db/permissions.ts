/** Ported from backend/database/seeders/RolesAndPermissionsSeeder.php. Review the matrix with the owner before production use. */
export const PERMISSIONS = [
  'clients.view', 'clients.create', 'clients.update', 'clients.archive',
  'journals.view', 'journals.create', 'journals.update', 'journals.delete', 'journals.amend', 'journals.approve', 'journals.post',
  'invoices.view', 'invoices.create', 'invoices.update', 'invoices.delete', 'invoices.amend', 'invoices.approve', 'invoices.issue',
  'expenses.view', 'expenses.create', 'expenses.approve',
  'tax.view', 'tax.prepare', 'tax.review',
  'hr.view', 'hr.manage', 'leave.apply', 'leave.approve',
  'payroll.view', 'payroll.process',
  'reports.view',
  'documents.view', 'documents.upload', 'documents.review',
  // Smart documents: download, edit, archive, delete, configure types and reminders, and read fields marked sensitive.
  'documents.download', 'documents.edit', 'documents.archive', 'documents.delete', 'documents.manage', 'documents.sensitive',
  'workflows.view', 'workflows.approve',
  'admin.users', 'admin.roles', 'admin.settings', 'admin.audit',
  // HR module. Salary and payroll keep their own names above; these guard the HR file itself.
  'hr.employees.view', 'hr.employees.manage', 'hr.bank.view', 'hr.org.manage', 'hr.contracts.view', 'hr.contracts.manage', 'hr.reports.view',
  // Writes code that runs on the server and in every user's browser. Held by the owner only unless an office grants it on purpose.
  'developer.scripts',
] as const;

const HR_FILE = ['hr.employees.view', 'hr.employees.manage', 'hr.bank.view', 'hr.org.manage', 'hr.contracts.view', 'hr.contracts.manage', 'hr.reports.view'];

export function roleMatrix(): Record<string, string[]> {
  const all: string[] = [...PERMISSIONS];
  const shared = all.filter((p) => p !== 'developer.scripts'); // scripts: the owner role only
  const nonPayroll = shared.filter((p) => !p.startsWith('payroll.'));
  const nonHr = nonPayroll.filter((p) => !p.startsWith('hr.') && p !== 'leave.approve');
  const view = all.filter((p) => p.endsWith('.view') && !p.startsWith('payroll.') && !p.startsWith('hr.'));
  return {
    owner: all,
    office_manager: nonPayroll,
    chief_accountant: nonHr.filter((p) => !['admin.users', 'admin.roles', 'admin.settings'].includes(p)),
    accountant: [
      'leave.apply', 'clients.view', 'clients.update', 'journals.view', 'journals.create', 'journals.update', 'journals.delete',
      'invoices.view', 'invoices.create', 'invoices.update', 'invoices.delete', 'expenses.view', 'expenses.create',
      'tax.view', 'tax.prepare', 'reports.view', 'documents.view', 'documents.upload', 'documents.download', 'documents.edit', 'workflows.view',
    ],
    tax_specialist: ['leave.apply', 'clients.view', 'journals.view', 'invoices.view', 'tax.view', 'tax.prepare', 'tax.review', 'reports.view', 'documents.view', 'documents.upload', 'documents.download', 'documents.edit'],
    auditor: [...view, 'leave.apply', 'admin.audit'],
    hr_payroll: ['clients.view', 'hr.view', 'hr.manage', ...HR_FILE, 'leave.apply', 'leave.approve', 'payroll.view', 'payroll.process', 'documents.view', 'documents.upload', 'documents.download', 'documents.edit', 'documents.sensitive'],
    sales: ['leave.apply', 'clients.view', 'clients.create', 'clients.update', 'invoices.view', 'invoices.create', 'documents.view'],
    client: [],
    read_only: view,
  };
}
