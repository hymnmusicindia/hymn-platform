import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = 'HYMN Music. The person who sent you this? Excellent taste. Awesome human.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const [regular, bold, logo] = await Promise.all([
    readFile(join(process.cwd(), 'public/fonts/manrope-regular.ttf')),
    readFile(join(process.cwd(), 'public/fonts/manrope-bold.ttf')),
    readFile(join(process.cwd(), 'public/assets/hymnlogowhite.png'))
  ]);
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: '#ffffff', color: '#192330', fontFamily: 'Manrope' }}>
      <img src={`data:image/png;base64,${logo.toString('base64')}`} alt="" width={600} height={202} style={{ objectFit: 'contain', filter: 'brightness(0)', marginTop: -24 }}/>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', bottom: 54, left: 0, width: '100%', gap: 7 }}>
        <span style={{ fontSize: 20, color: '#637083' }}>The person who sent you this?</span>
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.6px' }}>Excellent taste. Awesome human.</span>
      </div>
    </div>,
    { ...size, fonts: [{ name: 'Manrope', data: regular, weight: 400, style: 'normal' }, { name: 'Manrope', data: bold, weight: 700, style: 'normal' }] }
  );
}
