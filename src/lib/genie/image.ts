// Minimal PNG/JPEG header reading for template artwork: type, pixel size and transparency (no image library needed)

export type ImageInfo = { contentType: 'image/png' | 'image/jpeg'; width: number; height: number; hasAlpha: boolean };

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function png(buf: Buffer): ImageInfo | null {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG) || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20), colorType = buf[25];
  // Colour types 4 and 6 carry alpha; palette/greyscale/RGB images can add it with a tRNS chunk
  let hasAlpha = colorType === 4 || colorType === 6;
  for (let off = 8; !hasAlpha && off + 8 <= buf.length;) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8);
    if (type === 'tRNS') hasAlpha = true;
    if (type === 'IDAT' || type === 'IEND') break;
    off += 12 + len;
  }
  return { contentType: 'image/png', width, height, hasAlpha };
}

function jpeg(buf: Buffer): ImageInfo | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) { off++; continue; }
    const marker = buf[off + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
    const len = buf.readUInt16BE(off + 2);
    // Start-of-frame markers (not DHT C4, JPG C8, DAC CC) hold the size
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { contentType: 'image/jpeg', height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7), hasAlpha: false };
    }
    off += 2 + len;
  }
  return null;
}

export function readImageInfo(buf: Buffer): ImageInfo | null {
  return png(buf) ?? jpeg(buf);
}

// Artwork must have the canvas's shape (within 2%); smaller than the canvas prints soft
export function artworkFit(info: { width: number; height: number }, canvas: { widthPx: number; heightPx: number }): { ok: true; warning?: string } | { ok: false; error: string } {
  const ratio = (info.width / info.height) / (canvas.widthPx / canvas.heightPx);
  if (Math.abs(ratio - 1) > 0.02) {
    return { ok: false, error: `The image is ${info.width}×${info.height}, but this layout is ${canvas.widthPx}×${canvas.heightPx}. Use an image with the same shape.` };
  }
  if (info.width < canvas.widthPx * 0.95) {
    return { ok: true, warning: `The image is ${info.width}×${info.height}, smaller than the ${canvas.widthPx}×${canvas.heightPx} print size, so it may print soft.` };
  }
  return { ok: true };
}
