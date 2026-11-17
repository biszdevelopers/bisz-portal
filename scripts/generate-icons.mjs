import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BLUE = [47, 111, 235, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function png(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size, transparentBadge = false) {
  const pixels = Buffer.alloc(size * size * 4);
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const index = (y * size + x) * 4;
    pixels[index] = color[0];
    pixels[index + 1] = color[1];
    pixels[index + 2] = color[2];
    pixels[index + 3] = color[3];
  };
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.22;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!transparentBadge) {
        const dx = Math.max(Math.abs(x - cx) - (size / 2 - radius), 0);
        const dy = Math.max(Math.abs(y - cy) - (size / 2 - radius), 0);
        const inside = dx * dx + dy * dy <= radius * radius;
        if (inside) set(x, y, BLUE);
      } else {
        const distance = Math.hypot(x - cx, y - cy);
        if (distance < size * 0.34) {
          const angle = Math.atan2(y - cy, x - cx);
          const shoulder = Math.cos(angle) * 0.12;
          if (distance < size * 0.22 + shoulder) set(x, y, WHITE);
        }
      }
    }
  }
  if (!transparentBadge) {
    const barLeft = Math.round(size * 0.31);
    const barRight = Math.round(size * 0.4);
    const top = Math.round(size * 0.27);
    const bottom = Math.round(size * 0.73);
    for (let y = top; y < bottom; y += 1) {
      for (let x = barLeft; x < barRight; x += 1) set(x, y, WHITE);
    }
    const outer = size * 0.25;
    const inner = size * 0.13;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (x < cx) continue;
        const distance = Math.hypot(x - cx, y - cy);
        if (distance < outer && distance > inner) set(x, y, WHITE);
      }
    }
    const centerTop = Math.round(size * 0.37);
    const centerBottom = Math.round(size * 0.63);
    for (let y = centerTop; y < centerBottom; y += 1) {
      const halfHeight = (centerBottom - centerTop) / 2;
      const t = Math.abs(y - (centerTop + centerBottom) / 2) / halfHeight;
      const right = cx + inner + (1 - t) * (outer - inner);
      for (let x = cx; x < right; x += 1) set(x, y, WHITE);
    }
  }
  return png(size, size, pixels);
}

mkdirSync("public/icons", { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, drawIcon(size));
  writeFileSync(`public/icons/maskable-${size}.png`, drawIcon(size));
}
writeFileSync("public/icons/apple-touch-icon.png", drawIcon(180));
writeFileSync("public/icons/badge-72.png", drawIcon(72, true));
console.log("Generated PWA icons in public/icons");
