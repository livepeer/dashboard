"use client";

import { useState } from "react";

export function AccountAvatar({
  email,
  avatarUrl,
}: {
  email?: string;
  avatarUrl?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <div className="mx-auto flex size-14 items-center justify-center overflow-hidden rounded-full bg-muted text-xl font-medium text-muted-foreground">
      {avatarUrl && failedUrl !== avatarUrl ? (
        <img
          src={avatarUrl}
          alt="Your profile picture"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        <span aria-label="Profile avatar">
          {email?.charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </div>
  );
}
