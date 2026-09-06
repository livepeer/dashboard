import type { SendVerificationEmailInput } from "@/lib/email/provider";

const SUBJECT = "Verify your email for the Livepeer waitlist";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderVerificationEmail(
  input: Pick<SendVerificationEmailInput, "verificationUrl" | "expiresAt">
) {
  const verificationUrl = escapeHtml(input.verificationUrl);
  const expiry = new Date(input.expiresAt);
  const expiryText = Number.isNaN(expiry.getTime())
    ? "15 minutes"
    : expiry.toISOString();

  return {
    subject: SUBJECT,
    text: [
      "Verify your email to join the Livepeer waitlist:",
      input.verificationUrl,
      "",
      `This link expires at ${expiryText}.`,
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>Verify your email to join the Livepeer waitlist.</p>",
      `<p><a href="${verificationUrl}">Verify email</a></p>`,
      `<p>This link expires at ${escapeHtml(expiryText)}.</p>`,
      "<p>If you did not request this, you can ignore this email.</p>",
    ].join(""),
  };
}
