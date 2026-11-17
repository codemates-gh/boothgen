// Quote and invoice line items are saved as "Name — description". Show the name as a title and the rest as
// bullets: split on dashes (as before) and also on line breaks and "*" / "•" markers, which is how package
// descriptions are usually typed (report #5: they ran together as one paragraph on screen and in the portal).
const DASH = /\s*[—–]\s*|\s+-\s+/;
const MARKER = /^[*•]\s*/;

function bulletLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .flatMap(line => {
      const t = line.trim();
      return MARKER.test(t) ? t.split(/\s+(?=[*•]\S)/) : [t];
    })
    .map(x => x.replace(MARKER, '').trim())
    .filter(Boolean);
}

export function splitLineItemDescription(text: string | null | undefined): { title: string; bullets: string[] } {
  const raw = (text ?? '').trim();
  if (!raw) return { title: '', bullets: [] };
  const [first, ...rest] = raw.split(DASH).map(p => p.trim()).filter(Boolean);
  const firstLines = (first ?? '').split(/\r?\n/);
  const title = firstLines[0].trim().replace(MARKER, '');
  const bullets = [...bulletLines(firstLines.slice(1).join('\n')), ...rest.flatMap(bulletLines)];
  return { title, bullets };
}
