import path from 'node:path';
import fs from 'node:fs';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getAllModules, getModule, searchModules, getModulesByCategory, getCategories } from './catalog.js';
import type { ModuleDefinition, ModuleCategory } from '../data/modules.js';
import { buildComposeFromModules } from '../utils/compose.js';
import { saveStackFiles, executeDockerCompose, isPortInUse } from '../utils/system.js';
import { formatBadge } from '../ui/banner.js';

export interface InstallAppOptions {
  yes?: boolean;
  dir?: string;
  start?: boolean;
}

export async function promptSingleAppConfig(mod: ModuleDefinition, options: InstallAppOptions = {}): Promise<void> {
  const isNonInteractive = Boolean(options.yes || !process.stdin.isTTY);

  p.intro(formatBadge(`📦 KURULUM: ${mod.name}`, 'violet'));

  console.log(pc.dim(`  Açıklama: ${mod.description}`));
  console.log(pc.dim(`  Görsel: ${mod.dockerImage}:${mod.defaultTag || 'latest'}`));
  if (mod.ports.length > 0) {
    console.log(pc.dim(`  Varsayılan Portlar: ${mod.ports.map((x) => `${x.default}:${x.internal} (${x.label})`).join(', ')}`));
  }

  // Pre-flight port check
  for (const portDef of mod.ports) {
    const inUse = await isPortInUse(portDef.default);
    if (inUse) {
      console.log(pc.yellow(`  ⚠️ Uyarı: Port ${portDef.default} şu anda sisteminizde kullanımda görünüyor!`));
    }
  }

  const customPorts: Record<string, number> = {};
  if (!isNonInteractive && mod.ports.length > 0) {
    const customizePorts = await p.confirm({
      message: 'Varsayılan portları değiştirmek ister misiniz?',
      initialValue: false,
    });

    if (p.isCancel(customizePorts)) return;

    if (customizePorts) {
      for (const pt of mod.ports) {
        const val = await p.text({
          message: `${pt.label} için host portu (İç: ${pt.internal}):`,
          initialValue: String(pt.default),
          validate: (input) => {
            const num = Number(input);
            if (isNaN(num) || num < 1 || num > 65535) return 'Geçerli bir port numarası girin (1-65535).';
          },
        });
        if (p.isCancel(val)) return;
        customPorts[`${mod.id}:${pt.internal}`] = Number(val);
      }
    }
  }

  // Environment variables
  const customEnv: Record<string, string> = {};
  const requiredEnvs = mod.environment.filter((e) => e.required);
  if (!isNonInteractive && requiredEnvs.length > 0) {
    console.log(pc.cyan('\n  🔧 Gerekli Yapılandırma Değişkenleri:'));
    for (const env of requiredEnvs) {
      const val = await p.text({
        message: `${env.key} (${env.description}):`,
        initialValue: env.defaultValue,
      });
      if (p.isCancel(val)) return;
      customEnv[env.key] = val;
    }
  }

  const defaultDir = options.dir || `./xivizley-${mod.id}`;
  let targetDirInput = defaultDir;
  if (!isNonInteractive) {
    const promptedDir = await p.text({
      message: 'Kurulum Hedef Dizini:',
      initialValue: defaultDir,
    });

    if (p.isCancel(promptedDir)) return;
    targetDirInput = promptedDir;
  }

  const targetDir = path.resolve(process.cwd(), targetDirInput);

  const s = p.spinner();
  s.start('Docker Compose ve konfigürasyon dosyaları oluşturuluyor...');

  const { yamlString, portLog } = buildComposeFromModules([mod], {
    portOverrides: customPorts,
    customEnv: { [mod.id]: customEnv },
  });

  // Generate .env
  let envContent = `# XIVIZLEY - ${mod.name} Environment\n`;
  for (const env of mod.environment) {
    const val = customEnv[env.key] || env.defaultValue;
    envContent += `${env.key}=${val}\n`;
  }

  const startScript = `#!/usr/bin/env bash
set -e
echo "🚀 ${mod.name} başlatılıyor..."
docker compose pull
docker compose up -d
echo "✅ ${mod.name} başarıyla ayağa kalktı!"
`;

  saveStackFiles(targetDir, [
    { filename: 'docker-compose.yml', content: yamlString },
    { filename: '.env', content: envContent },
    { filename: 'start.sh', content: startScript },
  ]);

  try {
    fs.chmodSync(path.join(targetDir, 'start.sh'), 0o755);
  } catch {}

  s.stop('Konfigürasyon dosyaları kaydedildi.');

  if (portLog.length > 0) {
    for (const msg of portLog) console.log(pc.yellow(`  ${msg}`));
  }

  p.note(
    `📂 Dizin: ${pc.cyan(targetDir)}\n` +
    `📄 docker-compose.yml oluşturuldu\n` +
    `🚀 Başlatmak için: cd ${targetDirInput} && docker compose up -d`,
    `${mod.name} Hazır`
  );

  let shouldStart = false;
  if (isNonInteractive) {
    shouldStart = Boolean(options.start === true);
  } else {
    const confirmStart = await p.confirm({
      message: 'Konteyneri hemen Docker ile başlatmak istiyor musunuz?',
      initialValue: true,
    });
    if (!p.isCancel(confirmStart) && confirmStart) {
      shouldStart = true;
    }
  }

  if (shouldStart) {
    const runSpinner = p.spinner();
    runSpinner.start(`${mod.name} konteyneri başlatılıyor...`);
    const res = await executeDockerCompose(targetDir);
    if (res.success) {
      runSpinner.stop(`✓ ${mod.name} başarıyla ayağa kaldırıldı!`);
    } else {
      runSpinner.stop(pc.yellow('⚠ Konteyner doğrudan başlatılamadı:'));
      console.log(pc.dim(res.output));
    }
  }

  p.outro(pc.bold(pc.magenta(`🎉 ${mod.name} kurulumu tamamlandı!`)));
}

export async function promptMultiAppComposer(selectedModules: ModuleDefinition[]): Promise<void> {
  p.intro(formatBadge(`☑️ ÇOKLU UYGULAMA BESTECİSİ (${selectedModules.length} Servis)`, 'violet'));

  console.log(pc.cyan('  Seçilen Servisler:'));
  for (const m of selectedModules) {
    console.log(pc.dim(`  • ${m.name} (${m.ports.map((p) => p.default).join(', ') || 'portsuz'})`));
  }

  const targetDirInput = await p.text({
    message: 'Birleşik Stack Hedef Dizini:',
    initialValue: './xivizley-multi-stack',
  });

  if (p.isCancel(targetDirInput)) return;

  const targetDir = path.resolve(process.cwd(), targetDirInput);

  const s = p.spinner();
  s.start('Otomatik port çakışma radarı çalıştırılıyor ve Docker Compose üretiliyor...');

  const { yamlString, portLog } = buildComposeFromModules(selectedModules);

  let envContent = `# XIVIZLEY Multi-Service Stack\n`;
  for (const mod of selectedModules) {
    envContent += `\n# --- ${mod.name} ---\n`;
    for (const e of mod.environment) {
      envContent += `${e.key}=${e.defaultValue}\n`;
    }
  }

  const startScript = `#!/usr/bin/env bash
set -e
echo "🚀 XIVIZLEY Çoklu Servis Stack Başlatılıyor..."
docker compose pull
docker compose up -d
echo "✅ Tüm servisler başarıyla ayağa kalktı!"
`;

  saveStackFiles(targetDir, [
    { filename: 'docker-compose.yml', content: yamlString },
    { filename: '.env', content: envContent },
    { filename: 'start.sh', content: startScript },
  ]);

  try {
    fs.chmodSync(path.join(targetDir, 'start.sh'), 0o755);
  } catch {}

  s.stop('Birleşik Stack başarıyla üretildi.');

  if (portLog.length > 0) {
    console.log(pc.bold(pc.yellow('\n  🛡️ Otomatik Port Çakışma Radarı Raporu:')));
    for (const msg of portLog) {
      console.log(pc.yellow(`  ${msg}`));
    }
  } else {
    console.log(pc.green('  ✓ Seçilen servisler arasında hiçbir port çakışması tespit edilmedi.'));
  }

  p.note(
    `📂 Dizin: ${pc.cyan(targetDir)}\n` +
    `📦 Servis Sayısı: ${selectedModules.length}\n` +
    `📄 docker-compose.yml (Tek Dosyada Birleştirildi)\n` +
    `🚀 Başlatmak için: cd ${targetDirInput} && docker compose up -d`,
    'Çoklu Stack Özeti'
  );

  const shouldStart = await p.confirm({
    message: 'Tüm servisleri hemen arka planda başlatmak istiyor musunuz?',
    initialValue: true,
  });

  if (!p.isCancel(shouldStart) && shouldStart) {
    const runSpinner = p.spinner();
    runSpinner.start('Docker Compose orkestrasyonu başlatılıyor...');
    const res = await executeDockerCompose(targetDir);
    if (res.success) {
      runSpinner.stop('✓ Tüm konteynerler başarıyla ayağa kaldırıldı!');
    } else {
      runSpinner.stop(pc.yellow('⚠ Konteynerler başlatılamadı:'));
      console.log(pc.dim(res.output));
    }
  }

  p.outro(pc.bold(pc.magenta('🎉 Çoklu servis kurulumu tamamlandı!')));
}

export async function runStandaloneAppStore(): Promise<void> {
  p.intro(formatBadge('📦 XIVIZLEY TEKİL UYGULAMA MAĞAZASI (134 Docker Modülü)', 'violet'));

  const mode = await p.select({
    message: 'Uygulamaları nasıl bulmak istersiniz?',
    options: [
      { value: 'search', label: '🔍 Hızlı Arama (İsim, port veya anahtar kelime ile)', hint: 'Örn: jellyfin, wireguard' },
      { value: 'category', label: '📁 Kategoriye Göre Göz At (Medya, Güvenlik, Bulut, Oyun...)', hint: 'Kategorize liste' },
      { value: 'multi', label: '☑️ Çoklu Seçim Modu (Birden fazla app seçip tek compose üret)', hint: 'Composer modu' },
      { value: 'all', label: '📋 Tüm 130 Uygulamayı Alfabetik Listele', hint: 'Tam katalog' },
    ],
  });

  if (p.isCancel(mode)) return;

  if (mode === 'search') {
    const query = await p.text({
      message: 'Aramak istediğiniz uygulama veya anahtar kelime:',
      placeholder: 'jellyfin, minecraft, vpn, redis, ai...',
      validate: (val) => {
        if (!val || val.trim().length === 0) return 'Lütfen bir arama terimi girin.';
      },
    });

    if (p.isCancel(query)) return;

    const matches = searchModules(query);
    if (matches.length === 0) {
      p.note(`"${query}" ile eşleşen hiçbir uygulama bulunamadı.`, 'Sonuç Yok');
      return;
    }

    const selectedAppId = await p.select({
      message: `Bulunan Uygulamalar (${matches.length} sonuç):`,
      options: matches.slice(0, 25).map((m) => ({
        value: m.id,
        label: `${m.name} (${m.category})`,
        hint: m.description.length > 50 ? m.description.slice(0, 47) + '...' : m.description,
      })),
    });

    if (p.isCancel(selectedAppId)) return;
    const mod = getModule(selectedAppId as string);
    if (mod) await promptSingleAppConfig(mod);
  } else if (mode === 'category') {
    const cats = getCategories();
    const catChoice = await p.select({
      message: 'Kategori Seçin:',
      options: cats.map((c) => ({
        value: c.id,
        label: `${c.label} (${c.count} uygulama)`,
      })),
    });

    if (p.isCancel(catChoice)) return;

    const mods = getModulesByCategory(catChoice as ModuleCategory);
    const selectedAppId = await p.select({
      message: 'Uygulama Seçin:',
      options: mods.map((m) => ({
        value: m.id,
        label: m.name,
        hint: m.description.length > 55 ? m.description.slice(0, 52) + '...' : m.description,
      })),
    });

    if (p.isCancel(selectedAppId)) return;
    const mod = getModule(selectedAppId as string);
    if (mod) await promptSingleAppConfig(mod);
  } else if (mode === 'multi') {
    const all = getAllModules();
    const selectedIds = await p.multiselect({
      message: 'Birlikte kurmak istediğiniz uygulamaları seçin (Boşluk tuşu ile işaretleyin):',
      options: all.map((m) => ({
        value: m.id,
        label: `${m.name} [${m.category}]`,
        hint: `Port: ${m.ports.map((p) => p.default).join(', ') || 'yok'}`,
      })),
      required: true,
    });

    if (p.isCancel(selectedIds)) return;

    const chosenModules = (selectedIds as string[]).map((id) => getModule(id)!).filter(Boolean);
    await promptMultiAppComposer(chosenModules);
  } else if (mode === 'all') {
    const all = getAllModules().sort((a, b) => a.name.localeCompare(b.name));
    const selectedAppId = await p.select({
      message: 'Tüm Uygulamalar Kataloğu:',
      options: all.map((m) => ({
        value: m.id,
        label: `${m.name} [${m.category}]`,
        hint: m.description.length > 50 ? m.description.slice(0, 47) + '...' : m.description,
      })),
    });

    if (p.isCancel(selectedAppId)) return;
    const mod = getModule(selectedAppId as string);
    if (mod) await promptSingleAppConfig(mod);
  }
}

export async function runDirectAppInstall(appQuery: string, options: InstallAppOptions = {}): Promise<void> {
  const mod = getModule(appQuery);
  if (mod) {
    await promptSingleAppConfig(mod, options);
    return;
  }

  // If not exact match, search
  const matches = searchModules(appQuery);
  if (matches.length === 1) {
    await promptSingleAppConfig(matches[0], options);
    return;
  } else if (matches.length > 1) {
    p.intro(formatBadge(`📦 ARAMA: ${appQuery}`, 'violet'));
    const selectedAppId = await p.select({
      message: `"${appQuery}" için birden fazla uygulama bulundu. Hangisini kurmak istersiniz?`,
      options: matches.map((m) => ({
        value: m.id,
        label: `${m.name} (${m.category})`,
        hint: m.description.slice(0, 50),
      })),
    });
    if (p.isCancel(selectedAppId)) return;
    const chosen = getModule(selectedAppId as string);
    if (chosen) await promptSingleAppConfig(chosen, options);
  } else {
    console.log(pc.red(`❌ Hata: "${appQuery}" adında bir uygulama katalogda bulunamadı.`));
    console.log(pc.cyan(`Tüm uygulamaları görmek için: xivizley\n`));
  }
}
