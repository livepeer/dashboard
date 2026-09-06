/** Domain contracts. Only the integration coordinator changes this file. */
export type ProviderIdentity = {
  authority: string;
  issuer: string;
  subject: string;
  strategy?: string;
  email?: string;
  emailVerified: boolean;
  /** Presentation only; never used for identity matching or authorization. */
  avatarUrl?: string;
};

export type CanonicalIdentity = {
  userId: string;
  identityId: string;
  accountStatus: "active" | "disabled";
  verifiedEmail?: string;
  conflicts: string[];
};

export type ExternalAccountScope = {
  service: "pymthouse";
  issuer: string;
  appId: string;
};

export type ResolvedExternalAccount = {
  id: string;
  userId: string;
  externalUserId: string;
};

export type AccessState =
  | "approved"
  | "pending"
  | "revoked"
  | "disabled"
  | "unavailable";
export type AccessDecision = {
  state: AccessState;
  userId: string;
  grantId?: string;
};

export type AdminPrincipal = {
  adminGrantId: string;
  signupId: string;
  userId?: string;
};

/** Public signup context only; never authority, consent, or account identifiers. */
export type WaitlistEnrollmentContext = {
  source: "waitlist_auth";
  referralCode?: string;
  attribution: Record<string, string>;
};

export type AccessAction = "approve" | "revoke";
export type BulkAccessOutcome = {
  signupId: string;
  outcome: "approved" | "revoked" | "unchanged" | "ineligible" | "failed";
  code?: string;
};

export type BulkAccessRequest = {
  requestId: string;
  action: AccessAction;
  signupIds: string[];
};

export type AdminAccessRow = {
  id: string;
  email: string;
  waitlistStatus: string;
  accessState: AccessState;
  joinedAt: string;
  userId: string | null;
  newsletterSubscribed: boolean;
};

export type AdminAccessList = {
  rows: AdminAccessRow[];
  total: number;
  page: number;
  pageSize: number;
};

/** Backend-resolved profile; clients must never derive external account IDs. */
export type ConsoleSessionProfile = {
  userId: string;
  externalUserId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  provider: "github" | "google" | "email";
  isAdmin: boolean;
};
