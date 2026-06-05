import { fetchWithAuth } from './fetchWithAuth';
import { handleResponse } from './handleResponse';
import type {
  ErasureResultDto,
  LiftOutcome,
  RestrictionDto,
  RestrictionGround,
} from '../types/privacy';

const SUBJECT_BASE = '/api/users/me';
const ADMIN_BASE = '/api/admin/users';

/** Generic 4xx/5xx body. The backend serialises errors as JSON with a top-level `error` field. */
async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  return body ? `HTTP ${res.status}: ${body}` : `HTTP ${res.status}`;
}

// ---------------------------------------------------------------------------
// Subject-facing (`/api/users/me/...`)
// ---------------------------------------------------------------------------

/** `GET /api/users/me/restriction` — 200 with body, or 204 when none. */
export async function fetchMyRestriction(): Promise<RestrictionDto | null> {
  const res = await fetchWithAuth(`${SUBJECT_BASE}/restriction`);
  if (res.status === 204) return null;
  return handleResponse<RestrictionDto>(res);
}

export interface RestrictMyselfRequest {
  ground: RestrictionGround;
  reasonNote?: string;
}

/** `POST /api/users/me/restrict` — 201 with body. */
export async function restrictMyself(req: RestrictMyselfRequest): Promise<RestrictionDto> {
  const res = await fetchWithAuth(`${SUBJECT_BASE}/restrict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<RestrictionDto>(res);
}

/**
 * `DELETE /api/users/me/restrict` — first call 202 (notice sent), second 204
 * (actual lift) once the dwell has elapsed. Returns a discriminated union the
 * UI can render either case off of.
 */
export async function liftMyRestriction(): Promise<LiftOutcome> {
  const res = await fetchWithAuth(`${SUBJECT_BASE}/restrict`, { method: 'DELETE' });
  if (res.status === 202) {
    const body = (await res.json()) as { liftNoticeSentAt: string; liftAvailableAt: string };
    return { kind: 'NOTICE_SENT', liftNoticeSentAt: body.liftNoticeSentAt, liftAvailableAt: body.liftAvailableAt };
  }
  if (res.status === 204) return { kind: 'LIFTED_OR_NONE' };
  throw new Error(await readError(res));
}

/** `DELETE /api/users/me` — Art. 17 erasure of own account. Returns the cascade summary. */
export async function eraseMyself(): Promise<ErasureResultDto> {
  const res = await fetchWithAuth(SUBJECT_BASE, { method: 'DELETE' });
  return handleResponse<ErasureResultDto>(res);
}

/**
 * `POST /api/users/me/sessions/revoke` — "sign me out everywhere".
 * Records a revocation cutoff so any already-issued access token is
 * rejected by the resource server on its next call, then asks
 * Keycloak to terminate the user's server-side sessions and refresh
 * tokens. The caller's *own* next request will get 401 +
 * `session_revoked`; the SPA handles that in `fetchWithAuth` by
 * forcing a re-login. Requires fresh auth (`auth_time`).
 */
export async function revokeMySessions(): Promise<void> {
  const res = await fetchWithAuth(`${SUBJECT_BASE}/sessions/revoke`, { method: 'POST' });
  if (res.status !== 204) throw new Error(await readError(res));
}

// ---------------------------------------------------------------------------
// Operator (`/api/admin/users/{userId}/...`) — requires `gdpr-admin` role
// ---------------------------------------------------------------------------

export async function fetchUserRestriction(userId: string): Promise<RestrictionDto | null> {
  const res = await fetchWithAuth(`${ADMIN_BASE}/${encodeURIComponent(userId)}/restriction`);
  if (res.status === 204) return null;
  return handleResponse<RestrictionDto>(res);
}

export interface AdminRestrictRequest {
  ground: RestrictionGround;
  reasonNote: string;
}

export async function restrictUser(userId: string, req: AdminRestrictRequest): Promise<RestrictionDto> {
  const res = await fetchWithAuth(`${ADMIN_BASE}/${encodeURIComponent(userId)}/restrict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<RestrictionDto>(res);
}

export async function liftUserRestriction(userId: string): Promise<LiftOutcome> {
  const res = await fetchWithAuth(`${ADMIN_BASE}/${encodeURIComponent(userId)}/restrict`, { method: 'DELETE' });
  if (res.status === 202) {
    const body = (await res.json()) as { liftNoticeSentAt: string; liftAvailableAt: string };
    return { kind: 'NOTICE_SENT', liftNoticeSentAt: body.liftNoticeSentAt, liftAvailableAt: body.liftAvailableAt };
  }
  if (res.status === 204) return { kind: 'LIFTED_OR_NONE' };
  throw new Error(await readError(res));
}

export interface AdminErasureRequest {
  reasonNote: string;
}

export async function eraseUser(userId: string, req: AdminErasureRequest): Promise<ErasureResultDto> {
  const res = await fetchWithAuth(`${ADMIN_BASE}/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<ErasureResultDto>(res);
}

/**
 * `POST /api/admin/users/{userId}/sessions/revoke` — admin force
 * sign-out for the target user. Same effect as the subject endpoint
 * but the row carries `revoked_by = ADMIN` for audit.
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  const res = await fetchWithAuth(
    `${ADMIN_BASE}/${encodeURIComponent(userId)}/sessions/revoke`,
    { method: 'POST' },
  );
  if (res.status !== 204) throw new Error(await readError(res));
}
