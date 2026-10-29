import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const website = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dictionarySource = fs.readFileSync(path.join(website, 'i18n.js'), 'utf8');
const dictionaryEnd = dictionarySource.indexOf('const urlLanguage');
if (dictionaryEnd < 0) throw new Error('Translation catalog was not found');
const translations = vm.runInNewContext(`${dictionarySource.slice(0, dictionaryEnd)}\ntranslations`);

function translateText(value, missing) {
  const key = value.trim();
  if (!key || !/[А-Яа-яЁё]/.test(key)) return value;
  if (!Object.hasOwn(translations, key)) {
    missing.add(key);
    return value;
  }
  return value.replace(key, translations[key]);
}

function translateTag(tag, missing, pageName) {
  let result = /^<html\b/i.test(tag) ? tag.replace(/\blang="ru"/, 'lang="en"') : tag;
  result = result.replace(/\b(title|aria-label|alt|content)="([^"]*)"/g, (whole, name, value) =>
    `${name}="${translateText(value, missing)}"`);
  result = result.replace(/\b(href|src|content)="(favicon\.ico|site\.css|site\.js|i18n\.js|LICENSE\.txt|img\/[^\"]+)"/g,
    (_, name, value) => `${name}="../${value}"`);
  if (/\bdata-site-lang="ru"/.test(result)) {
    result = result.replace(/\bhref="[^"]+"/, `href="../${pageName}"`).replace(' aria-current="page"', '');
  } else if (/\bdata-site-lang="en"/.test(result)) {
    result = result.replace(/\bhref="[^"]+"/, `href="${pageName}"`).replace(/>$/, ' aria-current="page">');
  } else if (/\bhreflang="ru"/.test(result)) {
    result = result.replace(/\bhref="[^"]+"/, `href="../${pageName}"`);
  } else if (/\bhreflang="en"/.test(result)) {
    result = result.replace(/\bhref="[^"]+"/, `href="${pageName}"`);
  }
  return result;
}

function buildPage(name) {
  const source = fs.readFileSync(path.join(website, name), 'utf8');
  const missing = new Set();
  const tokens = source.match(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->|<[^>]*>|[^<]+/gi) || [];
  const result = tokens.map(token => {
    if (/^<script\b/i.test(token)) {
      const openingEnd = token.indexOf('>') + 1;
      return translateTag(token.slice(0, openingEnd), missing, name) + token.slice(openingEnd);
    }
    if (/^<(?:style|!--)/i.test(token)) return token;
    if (token.startsWith('<')) return translateTag(token, missing, name);
    return translateText(token, missing);
  }).join('');
  if (missing.size) throw new Error(`${name}: untranslated text:\n${[...missing].join('\n')}`);
  if (/[А-Яа-яЁё]/.test(result)) throw new Error(`${name}: Cyrillic text remains in the English page`);
  const target = path.join(website, 'en', name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, result);
  console.log(`Built ${path.relative(website, target)}`);
}

for (const name of ['index.html', 'licenses.html']) buildPage(name);
