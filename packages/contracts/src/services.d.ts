/** Safe metadata. The credential itself is only returned when it is issued. */
export interface ServiceKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string;
  /** Last successful exchange of the key for an access token. */
  lastUsedAt: string | null;
  /** Last successful exchange or authenticated key-backed HTTP request. */
  lastActivityAt: string | null;
  /** Exact decimal bigint: authenticated HTTP requests, excluding token exchange. */
  requestCount: string;
  revokedAt: string | null;
}
