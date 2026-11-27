"use client";

import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { DesignPicker } from "@/components/profile/DesignPicker";
import { DesignScene } from "./DesignScene";

/** A friend's free time, as the calendar draws it under your lane: a thin line with their face. */
function FriendsSwatch() {
  return (
    <span className="relative inline-block h-5 w-16 shrink-0 align-middle" aria-hidden="true">
      <span className="wire inset-x-0 top-[8px]" />
      <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-[#e8b4a0]" />
    </span>
  );
}

function Swatch({ kind }: { kind: "free" | "join" | "locked" }) {
  const beam = kind === "free" ? "" : kind === "join" ? "beam-join" : "beam-locked";
  return (
    <span className="relative inline-block h-5 w-16 shrink-0 align-middle" aria-hidden="true">
      <span className={`beam ${beam} inset-0`} />
    </span>
  );
}

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="How wheet works" footer={<Button variant="free" onClick={onClose}>Got it</Button>}>
      <div className="space-y-4">
        {/* Designs with a little scene greet you with it here. */}
        <DesignScene />
        <ul className="space-y-3">
          <li className="flex items-center gap-3">
            <Swatch kind="free" />
            <span><strong className="text-free">Free</strong>: you&apos;re available. Friends can see your avatar over that time.</span>
          </li>
          <li className="flex items-center gap-3">
            <Swatch kind="join" />
            <span><strong className="text-join">Join me</strong>: you&apos;re hosting something. Friends can see and join in.</span>
          </li>
          <li className="flex items-center gap-3">
            <Swatch kind="locked" />
            <span><strong className="text-locked">Confirmed</strong>: someone said they&apos;re in. It&apos;s happening!</span>
          </li>
          <li className="flex items-center gap-3">
            <FriendsSwatch />
            <span><strong className="text-ink">Friends</strong>: under your own blocks. A thin line with their faces where they&apos;re free; slim outlined bars for what they&apos;re hosting.</span>
          </li>
        </ul>
        <p className="text-ink-dim">
          Each day has your blocks on top (the thick bars) and your friends underneath, so you can see where your free time
          lines up with theirs.
        </p>
        <div className="divider" />
        <ul className="list-disc space-y-2 pl-5 text-ink-dim">
          <li><span className="text-ink">Add free time:</span> drag across a day to show when you&apos;re free.</li>
          <li><span className="text-ink">Host something:</span> tap your block, switch it to Join me and add the details.</li>
          <li><span className="text-ink">Change it:</span> drag the middle to move it, drag an end to resize it, tap to edit or delete.</li>
          <li><span className="text-ink">Empty means busy.</span> Only add the times you want friends to see.</li>
          <li><span className="text-ink">Sharing:</span> new blocks share with all your connections unless you pick people or groups.</li>
          <li><span className="text-ink">See friends&apos; plans:</span> tap a face or an outlined bar for the details. Say &quot;I&apos;m in&quot; to join.</li>
          <li><span className="text-ink">Chat:</span> every block has its own chat, for everyone or privately with one person. It&apos;s at the bottom when you open a block (on a computer, hover a block and click the chat button).</li>
          <li><span className="text-ink">Places:</span> save the places you use, and pin them from Google Maps so friends go straight there.</li>
          <li><span className="text-ink">Invite someone new:</span> use &quot;Save &amp; invite&quot; on a block. They get a link by text; signing up connects you.</li>
        </ul>
        <div className="divider" />
        <section aria-label="Design">
          <div className="label">Design</div>
          <p className="mb-2 text-[17px] text-ink-faint">How wheet looks on this device. It changes straight away.</p>
          <DesignPicker compact />
        </section>
      </div>
    </Dialog>
  );
}
