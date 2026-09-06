export const NEWSLETTER_PURPOSE = "product_marketing";
export function newsletterLockKey(normalizedEmail: string) {
  return `subscription:${normalizedEmail.trim().toLowerCase()}:${NEWSLETTER_PURPOSE}`;
}
