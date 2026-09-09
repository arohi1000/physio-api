/** The subset of a verified Google ID token this application relies on. */
export interface GoogleIdentity {
  readonly subject: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name?: string;
}

/**
 * Verifies a Google ID token's signature, issuer, audience and expiry.
 *
 * Abstract class rather than an interface so it doubles as a Nest DI token:
 * AuthService depends on this, never on `google-auth-library` (DIP —
 * EXECUTION-PLAN §4.3), which is what makes the sign-in flow unit-testable
 * without a real OAuth client.
 *
 * Implementations reject invalid tokens by throwing; they never return a
 * partially-verified identity.
 */
export abstract class GoogleTokenVerifier {
  abstract verify(idToken: string): Promise<GoogleIdentity>;
}
