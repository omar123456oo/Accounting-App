import type { WorkflowBlock } from './workflow.models';

export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'link', 'checkbox', 'currency'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldDef {
  fieldname: string;
  label: string;
  fieldtype: FieldType;
  /** Choices for a select field; the target document type for a link field. */
  options?: string[];
  required?: boolean;
  hidden?: boolean;
  /** Custom fields only: show this field right after the named one. */
  insertAfter?: string;
}

export interface DocTypeMeta {
  name: string;
  label: string;
  module: string;
  isCustom: boolean;
  titleField: string | null;
  /** A hint for the screen; the server decides. */
  canManage: boolean;
  fields: FieldDef[];
}

export interface DocTypeSummary {
  name: string;
  label: string;
  module: string;
  isCustom: boolean;
}

export interface DocTypeInput {
  name: string;
  label: string;
  module: string;
  fields: FieldDef[];
  titleField: string;
  searchFields: string[];
  viewPermission: string;
  managePermission: string;
}

export type RecordData = Record<string, unknown>;

export interface DocRecordView {
  name: string;
  title: string;
  data: RecordData;
  createdAt?: string;
  updatedAt?: string;
  /** Full workflow block, on a single record of a type with an active workflow. */
  workflow?: WorkflowBlock;
  /** Current state, on rows of a list of such a type. */
  state?: string;
  stateLabel?: string;
}

export interface RecordPage {
  data: DocRecordView[];
  meta: { page: number; pageSize: number; total: number };
}
