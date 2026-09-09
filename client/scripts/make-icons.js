/**
 * 生成 electron-builder 所需的程序图标（无第三方依赖）：
 *   client/build/icon.png  — 512x512 RGBA PNG（Linux AppImage）
 *   client/build/icon.ico  — 内含 256x256 PNG 的 ICO（Windows）
 *
 * 图标：品牌蓝圆角方块 + 白色圆环（"画面视图"隐喻）。
 * 用法：node scripts/make-icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---- 纯 PNG 编码 ----
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.from(type, 'ascii');
  let crc = zlib.crc32(Buffer.concat([td, data]));
  if (crc < 0) crc += 0x100000000; // JS 位运算为有符号 int32，转无符号
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc);
  return Buffer.concat([len, td, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, 9)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 图标绘制 ----
const BG = [0x2e, 0x6f, 0xe6, 0xff]; // 品牌蓝
const RING = [0xff, 0xff, 0xff, 0xff]; // 白色圆环

function inRoundedRect(x, y, size, margin, radius) {
  const x0 = margin, y0 = margin, x1 = size - margin, y1 = size - margin;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + radius, Math.min(x, x1 - radius));
  const cy = Math.max(y0 + radius, Math.min(y, y1 - radius));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function inRing(x, y, size) {
  const cx = size / 2, cy = size / 2;
  const d = Math.hypot(x - cx, y - cy);
  const rOuter = size * 0.34;
  const rInner = size * 0.24;
  return d <= rOuter && d >= rInner;
}

function drawIcon(size) {
  const margin = Math.max(2, size * 0.07);
  const radius = size * 0.22;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inRect = inRoundedRect(x + 0.5, y + 0.5, size, margin, radius);
      if (!inRect) continue; // 透明
      const c = inRing(x + 0.5, y + 0.5, size) ? RING : BG;
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = c[3];
    }
  }
  return rgba;
}

// ---- ICO（内嵌 PNG，Vista+ 兼容）----
function encodeICO(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // 256 width
  entry[1] = 0; // 256 height
  entry[2] = 0; // colors
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4);  // planes
  entry.writeUInt16LE(32, 6); // bitcount
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // offset
  return Buffer.concat([header, entry, png]);
}

function main() {
  const outDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(outDir, { recursive: true });

  const png512 = encodePNG(512, drawIcon(512));
  const png256 = encodePNG(256, drawIcon(256));
  const ico = encodeICO(png256);

  fs.writeFileSync(path.join(outDir, 'icon.png'), png512);
  fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
  console.log('生成图标:');
  console.log('  ' + path.join(outDir, 'icon.png') + ' (' + (png512.length / 1024).toFixed(1) + ' KB)');
  console.log('  ' + path.join(outDir, 'icon.ico') + ' (' + (ico.length / 1024).toFixed(1) + ' KB)');
}

main();