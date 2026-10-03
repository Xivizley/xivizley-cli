import path from 'node:path';
import fs from 'node:fs';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { saveStackFiles, executeDockerCompose } from '../utils/system.js';
import { formatBadge } from '../ui/banner.js';

export async function runBlueprintSync(blueprintInputArg?: string): Promise<void> {
  p.intro(formatBadge('🌐 XIVIZLEY BLUEPRINT SYNC MOTORU', 'violet'));

  let blueprintInput = blueprintInputArg;
  if (!blueprintInput) {
    const input = await p.text({
      message: 'XIVIZLEY Blueprint ID veya Paylaşım Bağlantısı:',
      placeholder: 'Örn: cly7812903 veya https://xivizley.com.tr/s/cly7812903',
      validate: (val) => {
        if (!val || val.trim().length === 0) return 'Lütfen geçerli bir Blueprint ID veya URL girin.';
      },
    });

    if (p.isCancel(input)) return;
    blueprintInput = input;
  }

  // Extract ID if URL is provided
  let blueprintId = blueprintInput.trim();
  if (blueprintId.includes('/s/')) {
    blueprintId = blueprintId.split('/s/')[1].split('/')[0].split('?')[0];
  } else if (blueprintId.includes('/')) {
    const parts = blueprintId.split('/').filter(Boolean);
    blueprintId = parts[parts.length - 1];
  }

  const s = p.spinner();
  s.start(`XIVIZLEY Bulutundan Blueprint (${blueprintId}) indiriliyor...`);

  // Target endpoints to attempt fetching
  const endpoints = [
    `https://xivizley.com.tr/api/run/${blueprintId}`,
    `http://localhost:3000/api/run/${blueprintId}`,
  ];

  let scriptContent: string | null = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'XIVIZLEY-CLI/1.0' }, signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        scriptContent = await res.text();
        break;
      }
    } catch {
      // Continue to next endpoint or fallback
    }
  }

  // If remote is unreachable, generate a resilient fallback blueprint
  if (!scriptContent || scriptContent.includes('Hata: Belirtilen mimari')) {
    s.stop(pc.yellow(`⚠️ Çevrimiçi mimari bulunamadı veya sunucu yanıt vermedi.`));
    console.log(pc.dim(`  ID: ${blueprintId} için yerel çevrimdışı profil oluşturuluyor...`));

    scriptContent = `#!/usr/bin/env bash
# XIVIZLEY Blueprint Sync - Fallback Stack (${blueprintId})
set -e
echo "🚀 XIVIZLEY Blueprint (${blueprintId}) ayağa kaldırılıyor..."
cat << 'EOF' > docker-compose.yml
version: '3.8'
services:
  blueprint_gateway:
    image: nginx:alpine
    container_name: xivizley_${blueprintId}_gw
    restart: unless-stopped
    ports:
      - "8080:80"
networks:
  default:
    name: xivizley_${blueprintId}_net
EOF
docker compose up -d
echo "✅ Blueprint başarıyla başlatıldı!"
`;
  } else {
    s.stop(`✓ Blueprint (${blueprintId}) başarıyla senkronize edildi!`);
  }

  const targetDirInput = await p.text({
    message: 'Blueprint Mimarisinin Kaydedileceği Dizin:',
    initialValue: `./xivizley-blueprint-${blueprintId}`,
  });

  if (p.isCancel(targetDirInput)) return;

  const targetDir = path.resolve(process.cwd(), targetDirInput);
  saveStackFiles(targetDir, [
    { filename: 'deploy.sh', content: scriptContent },
  ]);

  try {
    fs.chmodSync(path.join(targetDir, 'deploy.sh'), 0o755);
  } catch {}

  p.note(
    `📂 Dizin: ${pc.cyan(targetDir)}\n` +
    `🚀 Dağıtım Betiği: ${path.join(targetDir, 'deploy.sh')}\n` +
    `Çalıştırmak için: cd ${targetDirInput} && ./deploy.sh`,
    'Blueprint Hazır'
  );

  const shouldRun = await p.confirm({
    message: 'Mimari betiğini şimdi çalıştırmak istiyor musunuz?',
    initialValue: false,
  });

  if (!p.isCancel(shouldRun) && shouldRun) {
    console.log(pc.cyan('Betiği terminalinizde çalıştırmak için aşağıdaki komutu kullanın:'));
    console.log(pc.bold(pc.magenta(`cd "${targetDir}" && ./deploy.sh\n`)));
  }

  p.outro(pc.bold(pc.magenta('🌐 Blueprint senkronizasyonu tamamlandı!')));
}
