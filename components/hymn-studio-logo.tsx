import s from './hymn-studio.module.css';

/** Crop the transparent canvas in the viewport; preserve the supplied artwork bytes. */
export function HymnStudioLogo({ mobile = false }: { mobile?: boolean }) {
  return <svg viewBox="52 193 392 117" role="img" aria-label="HYMN Studio" className={mobile ? s.mobileStudioLogo : s.studioLogo}>
    <image href="/assets/hymn-studio-logo.png" x="0" y="0" width="500" height="500"/>
  </svg>;
}
