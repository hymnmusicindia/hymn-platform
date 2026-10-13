import type { ImgHTMLAttributes } from "react";
import { artworkPreviewUrl } from "@/lib/artwork-preview";

type CoverArtProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string; previewWidth?: number };

/** Native responsive images work on Hostinger without the disabled Next optimizer. */
export function CoverArt({ src, previewWidth = 320, sizes, loading = "lazy", decoding = "async", ...props }: CoverArtProps) {
  const preview = artworkPreviewUrl(src, previewWidth);
  return <img {...props} src={preview} sizes={sizes} loading={loading} decoding={decoding}
    srcSet={preview === src ? undefined : `${artworkPreviewUrl(src, previewWidth)} 1x, ${artworkPreviewUrl(src, previewWidth * 2)} 2x`} />;
}
