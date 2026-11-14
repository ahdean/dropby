"use client";

import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

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
    <Dialog open={open} onClose={onClose} title="How dropby works" footer={<Button variant="free" onClick={onClose}>Got it</Button>}>
      <div className="space-y-4">
        <ul className="space-y-3">
          <li className="flex items-center gap-3">
            <Swatch kind="free" />
            <span><strong className="text-free">Free</strong>: you&apos;re available. Friends see your avatar over that time.</span>
          </li>
          <li className="flex items-center gap-3">
            <Swatch kind="join" />
            <span><strong className="text-join">Join me</strong>: you&apos;re hosting something. Friends can say they&apos;re in and chat.</span>
          </li>
          <li className="flex items-center gap-3">
            <Swatch kind="locked" />
            <span><strong className="text-locked">Locked in</strong>: someone is joining. It&apos;s happening!</span>
          </li>
        </ul>
        <div className="divider" />
        <ul className="list-disc space-y-2 pl-5 text-ink-dim">
          <li><span className="text-ink">Add free time:</span> drag across a day (on a phone: press, hold, then drag). It appears straight away.</li>
          <li><span className="text-ink">Host something:</span> tap your block, switch it to Join me and add the details.</li>
          <li><span className="text-ink">Change it:</span> drag the middle to move it, drag an end to resize, tap to edit or delete.</li>
          <li><span className="text-ink">Empty means busy.</span> Only add the times you want friends to see.</li>
          <li><span className="text-ink">Sharing:</span> new blocks go to all your connections unless you pick people or groups.</li>
          <li><span className="text-ink">Invite someone new:</span> open a block and use &quot;Invite by text&quot;. They get a link; signing up connects you.</li>
        </ul>
      </div>
    </Dialog>
  );
}
