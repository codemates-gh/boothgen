export function BoothGeniusIcon({ size = 68 }: { size?: number }) {
  const h = Math.round(size * (108 / 90));
  return (
    <svg width={size} height={h} viewBox="0 0 90 108" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="28" y="50" width="34" height="52" rx="3" fill="#2D1B69" />
      <rect x="33" y="89" width="24" height="1.5" rx="0.75" fill="white" opacity="0.20" />
      <rect x="33" y="92" width="24" height="1.5" rx="0.75" fill="white" opacity="0.14" />
      <rect x="33" y="95" width="24" height="1.5" rx="0.75" fill="white" opacity="0.08" />
      <rect x="33" y="61" width="24" height="4" rx="1.5" fill="white" opacity="0.78" />
      <rect x="33" y="70" width="24" height="4" rx="1.5" fill="white" opacity="0.78" />
      <rect x="33" y="79" width="24" height="4" rx="1.5" fill="white" opacity="0.78" />
      <circle cx="45" cy="33" r="25" fill="#F7B731" />
      <circle cx="40" cy="27" r="9" fill="white" opacity="0.18" />
      <path d="M38 43L45 31L52 43" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="38" y1="43" x2="38" y2="48" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <line x1="52" y1="43" x2="52" y2="48" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

type LogoSize = 'sm' | 'md' | 'lg';
type LogoVariant = 'light' | 'dark';

const SIZES = {
  sm: { icon: 44, name: 30, sub: 22, tagline: 9,  gap: 14 },
  md: { icon: 68, name: 48, sub: 36, tagline: 11, gap: 20 },
  lg: { icon: 90, name: 64, sub: 48, tagline: 14, gap: 24 },
};

export function BoothGeniusLogo({
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

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s.gap }}>
      <BoothGeniusIcon size={s.icon} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{
          fontFamily: "'Outfit', 'Helvetica Neue', Arial, sans-serif",
          fontSize: s.name,
          fontWeight: 500,
          letterSpacing: '0.04em',
          color: isDark ? '#FFFFFF' : '#2D1B69',
        }}>
          Booth
        </span>
        <span style={{
          fontFamily: "'Outfit', 'Helvetica Neue', Arial, sans-serif",
          fontSize: s.sub,
          fontWeight: 400,
          letterSpacing: '0.38em',
          color: '#F7B731',
          marginTop: -1,
        }}>
          Genius
        </span>
        {showTagline && (
          <span style={{
            fontFamily: "'Outfit', 'Helvetica Neue', Arial, sans-serif",
            fontSize: s.tagline,
            fontWeight: 400,
            letterSpacing: '0.28em',
            textTransform: 'uppercase' as const,
            color: isDark ? '#4A3880' : '#9A8BC0',
            marginTop: 10,
          }}>
            Photo Booth CRM
          </span>
        )}
      </div>
    </div>
  );
}

export default BoothGeniusLogo;
