import { OfficialRecord } from '../../features/tax/tax.models';
import { MockMessageKey } from './mock-messages';

/**
 * The ETA ADAPTER boundary. In the real system only the adapter talks to the authority and only a real response
 * can move a return or an e-invoice to an official state (submitted, accepted, rejected). No real integration
 * exists here, so the client is the NullEtaClient: it refuses to submit, and no API action, UI control or user
 * permission can set an official state. The only code that writes one is applyOfficialResponse, which demands a
 * real-looking response record, and nothing in the mock's routes calls it.
 */
export interface EtaSubmitResult {
  ok: false;
  reason: Extract<MockMessageKey, 'etaNotConfigured'>;
}

export interface EtaClient {
  readonly configured: boolean;
  submit(document: unknown): EtaSubmitResult;
}

export class NullEtaClient implements EtaClient {
  readonly configured = false;
  submit(): EtaSubmitResult {
    return { ok: false, reason: 'etaNotConfigured' };
  }
}

/** The client every route uses. There is no way to configure another one from the API. */
export const ETA_CLIENT: EtaClient = new NullEtaClient();

export interface OfficialResponse {
  status: OfficialRecord['status'];
  /** The authority's own reference: a UUID. */
  reference: string;
  /** The raw response body as received: JSON text that contains the same reference. */
  rawResponse: string;
  /** When it was received: an ISO timestamp. */
  receivedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OFFICIAL_STATUSES: readonly string[] = ['submitted', 'accepted', 'rejected'];

/** A response record is real-looking only when all of its parts are present and consistent with each other. */
export function isRealLookingResponse(r: unknown): r is OfficialResponse {
  if (!r || typeof r !== 'object') return false;
  const { status, reference, rawResponse, receivedAt } = r as Record<string, unknown>;
  if (typeof status !== 'string' || !OFFICIAL_STATUSES.includes(status)) return false;
  if (typeof reference !== 'string' || !UUID.test(reference)) return false;
  if (typeof receivedAt !== 'string' || Number.isNaN(Date.parse(receivedAt))) return false;
  if (typeof rawResponse !== 'string') return false;
  try {
    const parsed: unknown = JSON.parse(rawResponse);
    return !!parsed && typeof parsed === 'object' && rawResponse.includes(reference);
  } catch {
    return false;
  }
}

/**
 * The single writer of official states. Returns false and changes nothing unless the response record looks real.
 * Used by the adapter only; there is deliberately no route that reaches it in the mock.
 */
export function applyOfficialResponse(target: { official?: OfficialRecord }, response: unknown): boolean {
  if (!isRealLookingResponse(response)) return false;
  target.official = { status: response.status, reference: response.reference, rawResponse: response.rawResponse, receivedAt: response.receivedAt };
  return true;
}
