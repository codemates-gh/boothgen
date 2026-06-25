export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

function darken(hex: string, pct: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * pct);
  const r = Math.max(0, (n >> 16) - amt);
  const g = Math.max(0, ((n >> 8) & 0xff) - amt);
  const b = Math.max(0, (n & 0xff) - amt);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

interface LeadFormConfig {
  heading?: string;
  buttonText?: string;
  successHeading?: string;
  successMessage?: string;
  showPhone?: boolean;
  showCompany?: boolean;
  showEventDate?: boolean;
  showEventType?: boolean;
  showTimes?: boolean;
  showGuestCount?: boolean;
  showVenue?: boolean;
  showMessage?: boolean;
  requirePhone?: boolean;
  requireEventDate?: boolean;
}

const DEFAULTS: Required<LeadFormConfig> = {
  heading: 'Book with {{company}}',
  buttonText: 'Send My Inquiry',
  successHeading: 'We received your inquiry!',
  successMessage: "We'll be in touch within 1-2 business days.",
  showPhone: true,
  showCompany: true,
  showEventDate: true,
  showEventType: true,
  showTimes: true,
  showGuestCount: true,
  showVenue: true,
  showMessage: true,
  requirePhone: false,
  requireEventDate: true,
};

export async function GET(
  req: NextRequest,
  { params }: { params: { tenantSlug: string } }
) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenantSlug },
    include: { branding: { select: { companyName: true, logoUrl: true, primaryColor: true, leadFormConfig: true, supportPhone: true, replyToEmail: true, websiteUrl: true } } },
  });

  if (!tenant || tenant.status === 'SUSPENDED') {
    return new NextResponse('Not found', { status: 404 });
  }

  const co = tenant.branding?.companyName ?? tenant.name;
  const pc = tenant.branding?.primaryColor ?? '#F97316';
  const pd = darken(pc, 15);
  const api = '/api/public/' + params.tenantSlug + '/leads';
  const logo = tenant.branding?.logoUrl
    ? '<img src="' + tenant.branding.logoUrl + '" alt="' + co + '" style="height:40px;object-fit:contain"/>'
    : '';
  const contactParts: string[] = [];
  if (tenant.branding?.supportPhone) contactParts.push('<a href="tel:' + tenant.branding.supportPhone + '" style="color:inherit;text-decoration:none">📞 ' + tenant.branding.supportPhone + '</a>');
  if (tenant.branding?.replyToEmail) contactParts.push('<a href="mailto:' + tenant.branding.replyToEmail + '" style="color:inherit;text-decoration:none">✉ ' + tenant.branding.replyToEmail + '</a>');
  if (tenant.branding?.websiteUrl) contactParts.push('<a href="' + tenant.branding.websiteUrl + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">🌐 ' + tenant.branding.websiteUrl.replace(/^https?:\/\//, '') + '</a>');
  const contactBar = contactParts.length > 0
    ? '<div style="font-size:12px;color:#6b7280;margin-bottom:18px;display:flex;flex-wrap:wrap;gap:12px;">' + contactParts.join('') + '</div>'
    : '';

  const cfg: Required<LeadFormConfig> = { ...DEFAULTS, ...((tenant.branding?.leadFormConfig ?? {}) as LeadFormConfig) };
  const heading = cfg.heading.replace('{{company}}', co);

  const css = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    ':root{--p:' + pc + ';--pd:' + pd + '}',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#111827;font-size:15px;padding:24px 20px 32px}',
    '.hdr{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid var(--p)}',
    '.hdr h1{font-size:17px;font-weight:700}',
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}',
    '.full{grid-column:1/-1}',
    'label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:5px}',
    '.req{color:var(--p)}',
    'input,select,textarea{width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;color:#111827;background:#fff;outline:none;font-family:inherit;transition:border-color .15s}',
    'input:focus,select:focus,textarea:focus{border-color:var(--p);box-shadow:0 0 0 3px ' + pc + '22}',
    'textarea{resize:vertical;min-height:80px}',
    '.honey{display:none!important}',
    '.btn{margin-top:20px;width:100%;padding:13px;background:var(--p);color:#fff;font-size:15px;font-weight:700;border:none;border-radius:8px;cursor:pointer;transition:background .15s;font-family:inherit}',
    '.btn:hover{background:var(--pd)}',
    '.btn:disabled{opacity:.65;cursor:not-allowed}',
    '.errbox{padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:13px;margin-top:14px;display:none}',
    '.datewarn{padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:12px;margin-top:6px;display:none}',
    '.succ{display:none;text-align:center;padding:40px 20px}',
    '.succ-icon{width:60px;height:60px;background:var(--p);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}',
    '.succ h2{font-size:20px;margin-bottom:8px}',
    '.succ p{color:#6b7280;font-size:14px}',
    '@media(max-width:480px){.grid{grid-template-columns:1fr}}',
  ].join('');

  const req2fields: string[] = ['firstName', 'lastName', 'email'];
  if (cfg.requirePhone) req2fields.push('phone');
  if (cfg.requireEventDate) req2fields.push('eventDate');

  const html = '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
    '<meta charset="UTF-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1.0"/>' +
    '<title>' + heading + '</title>' +
    '<style>' + css + '</style>' +
    '</head>' +
    '<body>' +
    '<div class="hdr">' + logo + '<h1>' + heading + '</h1></div>' +
    contactBar +
    '<form id="f" novalidate>' +
    '<input class="honey" type="text" name="website" tabindex="-1" autocomplete="off"/>' +
    '<div class="grid">' +
    '<div><label>First Name <span class="req">*</span></label><input type="text" name="firstName" autocomplete="given-name" required/></div>' +
    '<div><label>Last Name <span class="req">*</span></label><input type="text" name="lastName" autocomplete="family-name" required/></div>' +
    '<div><label>Email <span class="req">*</span></label><input type="email" name="email" autocomplete="email" required/></div>' +
    (cfg.showPhone ? '<div><label>Phone' + (cfg.requirePhone ? ' <span class="req">*</span>' : '') + '</label><input type="tel" name="phone" autocomplete="tel"/></div>' : '') +
    (cfg.showCompany ? '<div class="full"><label>Company / Organization</label><input type="text" name="company" autocomplete="organization" placeholder="Acme Corp (optional)"/></div>' : '') +
    (cfg.showEventDate ? '<div><label>Event Date' + (cfg.requireEventDate ? ' <span class="req">*</span>' : '') + '</label><input type="date" name="eventDate" id="eventDate"/><div class="datewarn" id="dateWarn">Sorry, we\'re not available on this date. Please choose another date.</div></div>' : '') +
    (cfg.showEventType ? '<div><label>Event Type</label><select name="eventType"><option value="">-- Select --</option><option>Wedding</option><option>Corporate Event</option><option>Birthday Party</option><option>Quincea\xf1era / Sweet 16</option><option>Graduation</option><option>Holiday Party</option><option>Other</option></select></div>' : '') +
    (cfg.showTimes ? '<div><label>Start Time</label><input type="time" name="startTime"/></div>' : '') +
    (cfg.showTimes ? '<div><label>End Time</label><input type="time" name="endTime"/></div>' : '') +
    (cfg.showGuestCount ? '<div><label>Est. Guest Count</label><input type="number" name="guestCount" min="1" max="5000" placeholder="150"/></div>' : '') +
    (cfg.showVenue ? '<div class="full"><label>Venue Name</label><input type="text" name="venueName" placeholder="Ballroom, backyard, event hall..."/></div>' : '') +
    (cfg.showVenue ? '<div class="full"><label>Venue Address</label><input type="text" name="venueAddress" autocomplete="street-address" placeholder="123 Main St"/></div>' : '') +
    (cfg.showVenue ? '<div><label>City</label><input type="text" name="venueCity" autocomplete="address-level2"/></div>' : '') +
    (cfg.showVenue ? '<div><label>State</label><input type="text" name="venueState" autocomplete="address-level1" placeholder="MD"/></div>' : '') +
    (cfg.showVenue ? '<div><label>Zip Code</label><input type="text" name="venuePostalCode" autocomplete="postal-code" placeholder="20001"/></div>' : '') +
    (cfg.showMessage ? '<div class="full"><label>Additional Notes</label><textarea name="message" placeholder="Special requests, theme, anything else we should know..."></textarea></div>' : '') +
    '</div>' +
    '<div class="errbox" id="eb"></div>' +
    '<button type="submit" class="btn" id="sb">' + cfg.buttonText + '</button>' +
    '</form>' +
    '<div class="succ" id="succ">' +
    '<div class="succ-icon"><svg viewBox="0 0 24 24" width="30" height="30" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>' +
    '<h2>' + cfg.successHeading + '</h2>' +
    '<p>' + cfg.successMessage + '</p>' +
    '</div>' +
    '<script>(function(){' +
    'function sh(){window.parent.postMessage({type:"pbcrm:resize",height:document.body.scrollHeight},"*")}' +
    'sh();' +
    'new ResizeObserver(sh).observe(document.body);' +
    'var AVAIL_API="/api/public/' + params.tenantSlug + '/availability";' +
    'var dateBlocked=false;' +
    '(function(){' +
    'var di=document.getElementById("eventDate");' +
    'var dw=document.getElementById("dateWarn");' +
    'var sb=document.getElementById("sb");' +
    'if(!di||!dw)return;' +
    'di.addEventListener("change",async function(){' +
    'var v=di.value;' +
    'if(!v){dw.style.display="none";dateBlocked=false;return;}' +
    'try{' +
    'var r=await fetch(AVAIL_API+"?date="+v);' +
    'var j=await r.json();' +
    'dateBlocked=!j.available;' +
    'dw.style.display=dateBlocked?"block":"none";' +
    'sb.disabled=dateBlocked;' +
    '}catch(e){dateBlocked=false;}' +
    'sh();' +
    '});' +
    '})();' +
    'var REQ=' + JSON.stringify(req2fields) + ';' +
    'document.getElementById("f").addEventListener("submit",async function(e){' +
    'if(dateBlocked){e.preventDefault();return;}' +
    'e.preventDefault();' +
    'var eb=document.getElementById("eb"),sb=document.getElementById("sb");' +
    'eb.style.display="none";' +
    'if(this.elements["website"]&&this.elements["website"].value)return;' +
    'var ok=true;' +
    'REQ.forEach(function(n){var el=this.elements[n];if(!el)return;el.style.borderColor=el.value.trim()?"":"#ef4444";if(!el.value.trim())ok=false;},this);' +
    'if(!ok){eb.textContent="Please fill in all required fields.";eb.style.display="block";sh();return;}' +
    'sb.disabled=true;sb.textContent="Sending…";' +
    'var data={};' +
    'new FormData(this).forEach(function(v,k){if(k!=="website")data[k]=v;});' +
    'data.referrerUrl=document.referrer||window.location.href;' +
    'try{' +
    'var res=await fetch("' + api + '",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});' +
    'var json=await res.json();' +
    'if(!res.ok)throw new Error(json.error||"Submission failed");' +
    'document.getElementById("f").style.display="none";' +
    'document.getElementById("succ").style.display="block";' +
    'sh();' +
    'window.parent.postMessage({type:"pbcrm:lead_captured"},"*");' +
    '}catch(err){' +
    'eb.textContent=err.message||"Something went wrong. Please try again.";' +
    'eb.style.display="block";' +
    'sb.disabled=false;sb.textContent="' + cfg.buttonText.replace(/'/g, "\\'") + '";' +
    'sh();' +
    '}' +
    '});' +
    '})();</script>' +
    '<div style="text-align:center;padding:12px 0 8px;font-size:11px;color:#9ca3af">Powered by <a href="https://boothgenius.com" target="_blank" rel="noopener noreferrer" style="color:#6b7280;font-weight:600;text-decoration:none">Booth Genius</a></div>' +
    '</body></html>';

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': 'frame-ancestors *',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
