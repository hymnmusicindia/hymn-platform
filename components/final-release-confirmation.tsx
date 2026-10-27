"use client";
import { CustomerOverlay } from "./customer-overlay";
import { useAccessibleDialog } from "./ui/use-accessible-dialog";
import { X } from "lucide-react";

export function FinalReleaseConfirmation({open, onClose, onAgree}: {open: boolean; onClose(): void; onAgree(): void}) {
  const dialog = useAccessibleDialog(open, onClose);
  return <CustomerOverlay open={open}><div className="fixed inset-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md" style={{backdropFilter:"blur(10px)",zIndex:180}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="final-release-title" aria-describedby="final-release-copy" tabIndex={-1} className="w-full max-w-md rounded-2xl border p-6 shadow-2xl" style={{background:"var(--card,#14171d)",color:"var(--text,#eef1f6)",borderColor:"var(--border,#303847)"}}>
      <div className="flex items-center justify-between gap-4"><h2 id="final-release-title" className="text-xl font-semibold">One final confirmation</h2><button type="button" aria-label="Close final confirmation" onClick={onClose}><X size={20}/></button></div>
      <p id="final-release-copy" className="mt-4 text-sm leading-7">I have checked the music, credits, rights and delivery details, and I have authority to distribute this release.</p>
      <p className="mt-3 text-sm" style={{color:"var(--text-muted,#b2bdce)"}}>By choosing I agree, you confirm these details and start your submission.</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" className="btn-outline" onClick={onClose}>Back to review</button><button type="button" className="btn-primary" onClick={onAgree}>I agree - submit release</button></div>
    </section>
  </div></CustomerOverlay>;
}
