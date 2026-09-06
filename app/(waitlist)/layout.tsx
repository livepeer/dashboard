import type { Metadata } from "next";
import localFont from "next/font/local";

const waitlistInter = localFont({
  src: [
    {
      path: "../../assets/fonts/waitlist/InterVariable.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../../assets/fonts/waitlist/InterVariable-Italic.woff2",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-inter",
});

const waitlistFavorit = localFont({
  src: [
    {
      path: "../../assets/fonts/waitlist/FavoritPro-Light.woff2",
      weight: "300",
    },
    {
      path: "../../assets/fonts/waitlist/FavoritPro-Book.woff2",
      weight: "350",
    },
    {
      path: "../../assets/fonts/waitlist/FavoritPro-Regular.woff2",
      weight: "400",
    },
    {
      path: "../../assets/fonts/waitlist/FavoritPro-Medium.woff2",
      weight: "500",
    },
    {
      path: "../../assets/fonts/waitlist/FavoritPro-Bold.woff2",
      weight: "700",
    },
  ],
  variable: "--font-favorit",
});

const waitlistMono = localFont({
  src: "../../assets/fonts/waitlist/FavoritMono-Regular.woff2",
  weight: "400",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Join the waitlist — Livepeer Early Access",
  description:
    "Request early access to a faster way to build, run, and scale live video products.",
};

export default function WaitlistLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`waitlist-surface ${waitlistInter.variable} ${waitlistFavorit.variable} ${waitlistMono.variable}`}
    >
      {children}
    </div>
  );
}
