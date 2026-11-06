import fs from 'node:fs';

/**
 * Sürüm numarası tek kaynaktan gelir: package.json.
 * Elle yazılan sürüm etiketleri (--version / banner) sürüm bump'ında kayar,
 * bu yüzden her ikisi de bu sabiti kullanır.
 */
export const CLI_VERSION: string = (
  JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;
