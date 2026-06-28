import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const BRAND_DARK = '#1e1247';
const BRAND_MID = '#2D1B69';
const BRAND_ORANGE = '#f97316';
const BRAND_PURPLE_TEXT = 'rgba(196,181,253,0.85)';

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
          {/* Brand mark top-left */}
          <div
            style={{
              position: 'absolute',
              top: '48px',
              left: '60px',
              right: '0px',
              bottom: '0px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
              display: 'flex',
            }}
          >
            {title}
          </div>

          {subtitle && (
            <div
              style={{
                color: BRAND_PURPLE_TEXT,
                fontSize: '28px',
                fontWeight: '400',
                maxWidth: '800px',
                display: 'flex',
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
              display: 'flex',
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
          background: BRAND_DARK,
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
        {/* Decorative accent — top-right corner block (no filter/blur) */}
        <div
          style={{
            position: 'absolute',
            top: '0px',
            right: '0px',
            width: '420px',
            height: '420px',
            background: BRAND_MID,
            borderRadius: '0px 0px 0px 420px',
            display: 'flex',
          }}
        />
        {/* Decorative dot grid strip */}
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            right: '80px',
            display: 'flex',
            gap: '16px',
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: '8px',
                height: '8px',
                background: 'rgba(249,115,22,0.4)',
                borderRadius: '50%',
                display: 'flex',
              }}
            />
          ))}
        </div>

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
          <span
            style={{
              color: 'white',
              fontSize: '28px',
              fontWeight: '700',
              letterSpacing: '-0.5px',
              display: 'flex',
            }}
          >
            Booth Genius
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            color: 'white',
            fontSize: '72px',
            fontWeight: '800',
            lineHeight: 1.05,
            marginBottom: '20px',
            letterSpacing: '-1px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span>6 tools. 1 platform.</span>
          <span style={{ color: BRAND_ORANGE }}>Free to start.</span>
        </div>

        {/* Subline */}
        <div
          style={{
            color: BRAND_PURPLE_TEXT,
            fontSize: '24px',
            fontWeight: '400',
            maxWidth: '680px',
            lineHeight: 1.5,
            marginBottom: '48px',
            display: 'flex',
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
          boothgen.com
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
            display: 'flex',
          }}
        />
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
