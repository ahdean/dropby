"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { useConversations } from "@/lib/data/messages";
import { useMe } from "@/lib/data/profiles";
import { HelpDialog } from "./HelpDialog";
import { Logo } from "./Logo";
import { NotificationsBell } from "./NotificationsBell";

export function Header() {
  const { me } = useMe();
  const { unreadTotal } = useConversations();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b-2 border-black bg-panel/95 pt-[env(safe-area-inset-top)] backdrop-blur-[2px]">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between gap-3 px-3 sm:px-5">
        <Link href="/" aria-label="dropby, back to calendar" className="shrink-0">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3" aria-label="Main">
          <IconButton icon="help" label="How dropby works" onClick={() => setHelpOpen(true)} />
          <span className="relative inline-flex">
            <Link
              href="/messages"
              className="btn tile tile-dark !min-h-[40px] !w-10 !p-0"
              aria-label={unreadTotal > 0 ? `Private messages, ${unreadTotal} unread` : "Private messages"}
              title="Private messages"
            >
              <PixelIcon name="chat" size={16} />
            </Link>
            {unreadTotal > 0 && (
              <span className="badge pointer-events-none absolute -right-2 -top-2" aria-hidden="true">
                {unreadTotal > 9 ? "9+" : unreadTotal}
              </span>
            )}
          </span>
          <NotificationsBell />
          <Link
            href="/profile"
            className="btn tile tile-dark !min-h-[40px] !gap-2 !px-2"
            aria-label={me?.name ? `Profile: ${me.name}` : "Profile"}
          >
            <Avatar person={me} size={26} />
            <span className="hidden max-w-[10rem] truncate sm:inline">{me?.name || "Profile"}</span>
          </Link>
        </nav>
      </div>
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  );
}
