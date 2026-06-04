/**
 * Mirrors the backend GDPR DTOs in
 * `expenses-tracker-api/src/main/kotlin/com/vshpynta/expenses/api/controller/dto/`.
 * Keep these in sync with `RestrictionDtos.kt`, `ErasureResultDto.kt`,
 * and `AdminGdprDtos.kt` — there is no generated client.
 */

/** Mirror of `RestrictionGround` in `GdprEnums.kt`. */
export type RestrictionGround =
  | 'ACCURACY_CONTESTED'
  | 'UNLAWFUL_NOT_ERASED'
  | 'CONTROLLER_NO_LONGER_NEEDS'
  | 'OBJECTION_PENDING';

export const RESTRICTION_GROUNDS: ReadonlyArray<RestrictionGround> = [
  'ACCURACY_CONTESTED',
  'UNLAWFUL_NOT_ERASED',
  'CONTROLLER_NO_LONGER_NEEDS',
  'OBJECTION_PENDING',
];

/** Mirror of `RestrictionRequester` in `GdprEnums.kt`. */
export type RestrictionRequester = 'SUBJECT' | 'ADMIN';

/** Mirror of `ErasureRequester` in `GdprEnums.kt`. */
export type ErasureRequester = 'SUBJECT' | 'ADMIN' | 'INACTIVITY_JOB';

/** Mirror of `RestrictionDto`. */
export interface RestrictionDto {
  userId: string;
  restrictedAt: string;
  ground: RestrictionGround;
  requestedBy: RestrictionRequester;
  reasonNote: string | null;
  liftNoticeSentAt: string | null;
  /**
   * Server-computed `liftNoticeSentAt + dwell`. Present iff
   * `liftNoticeSentAt` is set. The client should treat this as the
   * authoritative deadline rather than computing one off a hardcoded
   * dwell — the configured dwell differs between environments (30s
   * locally, 7 days in production).
   */
  liftAvailableAt: string | null;
}

/** Mirror of `LiftNoticeAcknowledgedDto`. */
export interface LiftNoticeAcknowledgedDto {
  liftNoticeSentAt: string;
  liftAvailableAt: string;
}

/**
 * Unified result for the two-step lift flow. The backend returns 202 with
 * a body on the first call, 204 on subsequent calls (after dwell or if
 * nothing to lift). We collapse both 204 cases into the `LIFTED` /
 * `NOTHING_TO_LIFT` variants on the client side based on whether we had
 * previously recorded a notice.
 */
export type LiftOutcome =
  | { kind: 'NOTICE_SENT'; liftNoticeSentAt: string; liftAvailableAt: string }
  | { kind: 'LIFTED_OR_NONE' };

/** Mirror of `ErasureResultDto`. */
export interface ErasureResultDto {
  userId: string;
  requestedBy: ErasureRequester;
  eventsDeleted: number;
  projectionsDeleted: number;
  categoriesDeleted: number;
  keycloakDeleted: boolean;
  occurredAt: string;
  followUpInstructions: string[];
}
