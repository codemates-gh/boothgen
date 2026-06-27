import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const BRAND_DARK = '#1e1247';
const BRAND_ORANGE = '#f97316';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title');
  const subtitle = searchParams.get('subtitle');

  if (title) {
    return new ImageResponse(
      (
        <div
          style={{
            background: BRAND_DARK,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '60px',
            position: 'relative',
          }}
        >
          {/* Decorative glow top-right */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '400px',
              height: '400px',
              background: 'rgba(249,115,22,0.15)',
              borderRadius: '50%',
              filter: 'blur(80px)',
            }}
          />
          {/* Brand mark top-left */}
          <div
            style={{
              position: 'absolute',
              top: '48px',
              left: '60px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                background: BRAND_ORANGE,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                fontWeight: '900',
                color: 'white',
              }}
            >
              B
            </div>
            <span style={{ color: 'white', fontSize: '20px', fontWeight: '700' }}>
              Booth Genius
            </span>
          </div>
          {/* Title */}
          <div
            style={{
              color: 'white',
              fontSize: title.length > 40 ? '44px' : '56px',
              fontWeight: '800',
              lineHeight: 1.15,
              marginBottom: subtitle ? '16px' : '0px',
              maxWidth: '900px',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                color: 'rgba(196,181,253,0.9)',
                fontSize: '28px',
                fontWeight: '400',
                maxWidth: '800px',
              }}
            >
              {subtitle}
            </div>
          )}
          {/* Bottom accent bar */}
          <div
            style={{
              position: 'absolute',
              bottom: '0px',
              left: '0px',
              right: '0px',
              height: '6px',
              background: BRAND_ORANGE,
            }}
          />
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  // Default marketing card
  return new ImageResponse(
    (
      <div
        style={{
          background: `linear-gradient(135deg, ${BRAND_DARK} 0%, #2D1B69 100%)`,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          position: 'relative',
        }}
      >
        {/* Decorative circles */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '500px',
            height: '500px',
            background: 'rgba(249,115,22,0.12)',
            borderRadius: '50%',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-80px',
            left: '200px',
            width: '300px',
            height: '300px',
            background: 'rgba(139,92,246,0.1)',
            borderRadius: '50%',
            filter: 'blur(60px)',
          }}
        />
        {/* Logo row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '48px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              background: BRAND_ORANGE,
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              fontWeight: '900',
              color: 'white',
            }}
          >
            B
          </div>
          <span style={{ color: 'white', fontSize: '28px', fontWeight: '700', letterSpacing: '-0.5px' }}>
            Booth Genius
          </span>
        </div>
        {/* Headline */}
        <div
          style={{
            color: 'white',
            fontSize: '64px',
            fontWeight: '800',
            lineHeight: 1.1,
            marginBottom: '24px',
            maxWidth: '800px',
            letterSpacing: '-1px',
          }}
        >
          6 tools.{'\n'}1 platform.
        </div>
        <div
          style={{
            color: BRAND_ORANGE,
            fontSize: '40px',
            fontWeight: '800',
            marginBottom: '32px',
          }}
        >
          That&apos;s the Genius of it.
        </div>
        {/* Subline */}
        <div
          style={{
            color: 'rgba(196,181,253,0.85)',
            fontSize: '24px',
            fontWeight: '400',
            maxWidth: '700px',
            lineHeight: 1.5,
            marginBottom: '48px',
          }}
        >
          CRM · Quotes · Contracts · Invoicing · Client Portal · Photo Gallery
        </div>
        {/* CTA pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: BRAND_ORANGE,
            color: 'white',
            fontSize: '22px',
            fontWeight: '700',
            padding: '16px 36px',
            borderRadius: '50px',
          }}
        >
          Free to start — boothgen.com
        </div>
        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '0px',
            left: '0px',
            right: '0px',
            height: '6px',
            background: BRAND_ORANGE,
          }}
        />
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
