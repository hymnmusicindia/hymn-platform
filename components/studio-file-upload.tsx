"use client";
import { uploadStudioFile } from "@/lib/studio-upload-client";
import { useRouter } from "next/navigation";
import { UploadDropzone } from "@/components/upload-dropzone";

export function StudioFileUpload({ orderPublicId, role, onUploaded }: { orderPublicId: string; role: "SOURCE" | "DELIVERY"; onUploaded?: () => void }) {
  const router = useRouter();
  const source = role === "SOURCE";
  return <UploadDropzone
    accept="audio/wav,audio/x-wav,audio/flac,audio/mpeg,application/zip,.wav,.flac,.mp3,.zip"
    title={source ? "Source package" : "Delivery files"}
    description={source ? "Upload consolidated stems, multitracks, or a ZIP package" : "Upload the final WAV, MP3, or delivery ZIP"}
    helperLines={source ? ["Private", "WAV, FLAC, MP3, ZIP", "Resumable upload"] : ["Private", "Release-ready audio", "Versioned delivery"]}
    onSelect={async (file, controls) => {
      await uploadStudioFile(file, orderPublicId, role, controls);
      if (onUploaded) onUploaded(); else router.refresh();
    }}
  />;
}
