import { useId } from 'react';

// BoothGen mark: the gold sparkle from the Genie app icon on the same purple, for places that need a square
// (browser tab, sidebar, sign-in). The wordmark (BoothGenLogo) is the main logo.
export function BoothGenIcon({ size = 64 }: { size?: number }) {
  const id = 'bgm' + useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={id + 'b'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7B55EE"/><stop offset="1" stopColor="#4A2AB0"/></linearGradient>
        <linearGradient id={id + 'g'} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE7A3"/><stop offset=".55" stopColor="#FFC24B"/><stop offset="1" stopColor="#F59E2A"/></linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${id}b)`}/>
      <path fill={`url(#${id}g)`} d="M29 16 C32.42 31.58 32.42 31.58 48 35 C32.42 38.42 32.42 38.42 29 54 C25.58 38.42 25.58 38.42 10 35 C25.58 31.58 25.58 31.58 29 16Z"/>
      <path fill="#FFE7A3" d="M46 10 C47.26 15.74 47.26 15.74 53 17 C47.26 18.26 47.26 18.26 46 24 C44.74 18.26 44.74 18.26 39 17 C44.74 15.74 44.74 15.74 46 10Z"/>
    </svg>
  );
}

type LogoSize = 'sm' | 'md' | 'lg';
type LogoVariant = 'light' | 'dark';

const SIZES = {
  sm: { name: 30, tagline: 9,  gap: 12 },
  md: { name: 46, tagline: 11, gap: 16 },
  lg: { name: 64, tagline: 14, gap: 22 },
};

// BoothGen wordmark: "Booth" in purple (white on dark) and "Gen" in gold, one word. No icon.
// See the brand sheet: BoothGen (company), Genie (photo booth app), Genius (photo booth CRM).
export function BoothGenLogo({
  variant = 'light',
  size = 'md',
  showTagline = true,
}: {
  variant?: LogoVariant;
  size?: LogoSize;
  showTagline?: boolean;
}) {
  const s = SIZES[size];
  const isDark = variant === 'dark';
  const font = "'Outfit', 'Helvetica Neue', Arial, sans-serif";

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s.gap }} aria-label="BoothGen" role="img">
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{ fontFamily: font, fontSize: s.name, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
          <span style={{ color: isDark ? '#FFFFFF' : '#2D1B69' }}>Booth</span>
          <span style={{ color: '#F7B731' }}>Gen</span>
        </span>
        {showTagline && (
          <span style={{
            fontFamily: font, fontSize: s.tagline, fontWeight: 400, letterSpacing: '0.24em', textTransform: 'uppercase' as const,
            color: isDark ? '#A99BD6' : '#9A8BC0', marginTop: 8, whiteSpace: 'nowrap',
          }}>
            Photo Booth App + CRM
          </span>
        )}
      </div>
    </div>
  );
}

export default BoothGenLogo;
