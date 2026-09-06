export type WaitlistLeaderboardEntry = {
  displayName: string;
  points: number;
};

export type WaitlistReferralSummary = {
  pending: number;
  verified: number;
};

export type WaitlistMember = {
  accountRole: "member" | "admin";
  analyticsId: string;
  displayName: string;
  email: string;
  newsletterOptIn: boolean;
  points: number;
  position: number;
  referralCode: string;
  referralUrl: string;
  referrals: WaitlistReferralSummary;
};

export type WaitlistSessionResponse = {
  member: WaitlistMember;
};

export type WaitlistSignupRequest = {
  authOnly?: boolean;
  email: string;
  newsletterOptIn: boolean;
  referralCode?: string;
  company?: string;
  attribution?: Record<string, string>;
};

export type WaitlistMessageResponse = {
  message: string;
};

export const NEWSLETTER_CONSENT_VERSION = "2026-07-27";
