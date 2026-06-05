import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchMyRestriction,
  fetchUserRestriction,
  restrictMyself,
  restrictUser,
  liftMyRestriction,
  liftUserRestriction,
  eraseMyself,
  eraseUser,
  revokeMySessions,
  revokeUserSessions,
  type RestrictMyselfRequest,
  type AdminRestrictRequest,
  type AdminErasureRequest,
} from '../api/userPrivacy';
import type { RestrictionDto, LiftOutcome, ErasureResultDto } from '../types/privacy';

/**
 * TanStack Query hooks for the GDPR endpoints. Mirrors the
 * subject / admin split of the backend controllers. The restriction
 * mutations all invalidate the matching query so the status card
 * re-renders without an extra round trip from the caller.
 */

const MY_RESTRICTION_KEY = ['gdpr', 'restriction', 'me'] as const;
const userRestrictionKey = (userId: string) => ['gdpr', 'restriction', 'user', userId] as const;

// ---- subject hooks --------------------------------------------------------

export function useMyRestriction() {
  return useQuery<RestrictionDto | null>({
    queryKey: MY_RESTRICTION_KEY,
    queryFn: fetchMyRestriction,
  });
}

export function useRestrictMyself() {
  const qc = useQueryClient();
  return useMutation<RestrictionDto, Error, RestrictMyselfRequest>({
    mutationFn: restrictMyself,
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_RESTRICTION_KEY }),
  });
}

export function useLiftMyRestriction() {
  const qc = useQueryClient();
  return useMutation<LiftOutcome, Error, void>({
    mutationFn: liftMyRestriction,
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_RESTRICTION_KEY }),
  });
}

export function useEraseMyself() {
  // No invalidation needed — the user is being logged out immediately after.
  return useMutation<ErasureResultDto, Error, void>({
    mutationFn: eraseMyself,
  });
}

/**
 * "Sign me out everywhere" mutation. No cache invalidation — the
 * caller is expected to trigger `AuthContext.logout()` right after
 * success, which full-page-redirects through Keycloak SSO logout and
 * unmounts the React tree. The 401 + `session_revoked` path in
 * `fetchWithAuth` remains as a safety net if the explicit logout is
 * skipped or fails.
 */
export function useRevokeMySessions() {
  return useMutation<void, Error, void>({
    mutationFn: revokeMySessions,
  });
}

// ---- admin hooks ----------------------------------------------------------

export function useUserRestriction(userId: string, enabled: boolean) {
  return useQuery<RestrictionDto | null>({
    queryKey: userRestrictionKey(userId),
    queryFn: () => fetchUserRestriction(userId),
    enabled: enabled && userId.length > 0,
  });
}

export function useRestrictUser(userId: string) {
  const qc = useQueryClient();
  return useMutation<RestrictionDto, Error, AdminRestrictRequest>({
    mutationFn: (req) => restrictUser(userId, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: userRestrictionKey(userId) }),
  });
}

export function useLiftUserRestriction(userId: string) {
  const qc = useQueryClient();
  return useMutation<LiftOutcome, Error, void>({
    mutationFn: () => liftUserRestriction(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: userRestrictionKey(userId) }),
  });
}

export function useEraseUser(userId: string) {
  const qc = useQueryClient();
  return useMutation<ErasureResultDto, Error, AdminErasureRequest>({
    mutationFn: (req) => eraseUser(userId, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: userRestrictionKey(userId) }),
  });
}

/**
 * Admin force sign-out. Invalidates the target user's restriction
 * query for consistency (admin may want to immediately re-check
 * status afterwards), but the user being kicked obviously cannot see
 * that.
 */
export function useRevokeUserSessions(userId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => revokeUserSessions(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: userRestrictionKey(userId) }),
  });
}
