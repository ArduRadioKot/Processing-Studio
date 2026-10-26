/**
 * Распаковка ZIP без Python / PowerShell. Нужна на Windows, где нет `py`
 * и Expand-Archive часто падает в урезанном PATH Electron.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function findEocd(buf) {
  const maxComment = Math.min(buf.length - 22, 65535);
  for (let i = 0; i <= maxComment; i++) {
    const off = buf.length - 22 - i;
    if (off < 0) break;
    if (buf.readUInt32LE(off) !== EOCD) continue;
    if (buf.readUInt16LE(off + 20) === i) return off;
  }
  throw new Error('Не ZIP-архив');
}

function zip64Size(extra, tagNeed, fallback) {
  if (fallback !== 0xFFFFFFFF && fallback !== 0xFFFF) return fallback;
  let i = 0;
  while (i + 4 <= extra.length) {
    const tag = extra.readUInt16LE(i);
    const size = extra.readUInt16LE(i + 2);
    i += 4;
    if (tag === 0x0001 && size >= 8) {
      if (tagNeed === 'uncomp') return Number(extra.readBigUInt64LE(i));
      if (tagNeed === 'comp' && size >= 16) return Number(extra.readBigUInt64LE(i + 8));
      if (tagNeed === 'offset' && size >= 24) return Number(extra.readBigUInt64LE(i + 16));
    }
    i += size;
  }
  return fallback;
}

function safeJoin(root, name) {
  const rel = String(name || '').replace(/\\/g, '/');
  if (!rel || rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) return null;
  const parts = rel.split('/').filter((p) => p && p !== '.');
  if (parts.some((p) => p === '..')) return null;
  const dest = path.resolve(root, ...parts);
  const base = path.resolve(root);
  if (dest !== base && !dest.startsWith(base + path.sep)) return null;
  return dest;
}

function extractZipArchive(archive, dest) {
  const buf = fs.readFileSync(archive);
  if (buf.length < 22) throw new Error('Пустой ZIP');
  const eocd = findEocd(buf);
  const volume = buf.readUInt16LE(eocd + 4);
  if (volume !== 0) throw new Error('Многотомный ZIP не поддерживается');
  let entries = buf.readUInt16LE(eocd + 10);
  let cdOff = buf.readUInt32LE(eocd + 16);
  if (entries === 0xFFFF || cdOff === 0xFFFFFFFF) {
    throw new Error('ZIP64: распакуйте архив через tar');
  }
  mkdirp(dest);
  let p = cdOff;
  let written = 0;
  for (let i = 0; i < entries; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN) {
      throw new Error('Повреждён центральный каталог ZIP');
    }
    const method = buf.readUInt16LE(p + 10);
    const gpbf = buf.readUInt16LE(p + 8);
    let compSize = buf.readUInt32LE(p + 20);
    let uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    let localOff = buf.readUInt32LE(p + 42);
    const nameBuf = buf.slice(p + 46, p + 46 + nameLen);
    const extra = buf.slice(p + 46 + nameLen, p + 46 + nameLen + extraLen);
    const encoding = (gpbf & 0x800) ? 'utf8' : 'binary';
    const name = nameBuf.toString(encoding);
    uncompSize = zip64Size(extra, 'uncomp', uncompSize);
    compSize = zip64Size(extra, 'comp', compSize);
    localOff = zip64Size(extra, 'offset', localOff);
    p += 46 + nameLen + extraLen + commentLen;

    const out = safeJoin(dest, name);
    if (!out) continue;
    if (name.endsWith('/') || name.endsWith('\\')) {
      mkdirp(out);
      continue;
    }
    if (localOff + 30 > buf.length || buf.readUInt32LE(localOff) !== LOC) {
      throw new Error(`Повреждена запись ZIP: ${name}`);
    }
    const locNameLen = buf.readUInt16LE(localOff + 26);
    const locExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + locNameLen + locExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length) throw new Error(`Обрезан ZIP: ${name}`);
    const data = buf.slice(dataStart, dataEnd);
    let content;
    if (method === 0) content = data;
    else if (method === 8) content = zlib.inflateRawSync(data);
    else throw new Error(`ZIP compression ${method} не поддерживается (${name})`);
    mkdirp(path.dirname(out));
    fs.writeFileSync(out, content);
    written += 1;
  }
  if (!written) throw new Error('ZIP без файлов');
  return written;
}

module.exports = { extractZipArchive };
