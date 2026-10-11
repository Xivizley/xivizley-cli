import path from 'node:path';
import fs from 'node:fs';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getAllTemplates, getTemplate, getTemplatesByCategory, searchTemplates } from './catalog.js';
import { TEMPLATE_CATEGORIES, type StackTemplate, type TemplateCategory } from '../data/templates.js';
import { saveStackFiles, executeDockerCompose } from '../utils/system.js';
import { formatBadge } from '../ui/banner.js';

export interface DeployTemplateOptions {
  yes?: boolean;
  dir?: string;
  start?: boolean;
}

export async function deployTemplate(template: StackTemplate, options: DeployTemplateOptions = {}): Promise<void> {
  const isNonInteractive = Boolean(options.yes || !process.stdin.isTTY);

  p.intro(formatBadge(`🌟 ŞABLON: ${template.title}`, 'violet'));

  console.log(pc.bold(pc.cyan(`  ${template.subtitle}`)));
  console.log(pc.dim(`  ${template.description}\n`));
  console.log(pc.dim(`  📊 Zorluk Derecesi: `) + pc.yellow(template.difficulty));
  console.log(pc.dim(`  ⚡ Min. RAM Önerisi: `) + pc.green(`${template.minRamGB} GB`));
  console.log(pc.dim(`  🏷️ Etiketler: `) + pc.cyan(template.tags.join(', ')));
  console.log(pc.dim(`  📦 Modüller: `) + pc.magenta(template.moduleIds.join(', ')));

  const defaultDir = options.dir || `./xivizley-stack-${template.id}`;
  let targetDirInput = defaultDir;
  if (!isNonInteractive) {
    const promptedDir = await p.text({
      message: 'Şablonun Kurulacağı Hedef Dizin:',
      initialValue: defaultDir,
    });

    if (p.isCancel(promptedDir)) return;
    targetDirInput = promptedDir;
  }

  const targetDir = path.resolve(process.cwd(), targetDirInput);

  const s = p.spinner();
  s.start('Endüstriyel DIN 40719 şablon dosyaları hazırlanıyor...');

  const composeContent = template.composeSnippet.trim();
  const envContent = `# XIVIZLEY Industrial Stack - ${template.title}
COMPOSE_PROJECT_NAME=xivizley_${template.id.replace(/[^a-zA-Z0-9]/g, '_')}
HOST_DOMAIN=localhost
TZ=Europe/Istanbul
`;

  const startScript = `#!/usr/bin/env bash
set -e
echo "🚀 ${template.title} Stack Başlatılıyor..."
docker compose pull
docker compose up -d
echo "✅ ${template.title} başarıyla ayağa kalktı!"
`;

  const readmeContent = `# ${template.title}
${template.subtitle}

DIN 40719 Endüstriyel Standart Mimari

## Servisler:
${template.moduleIds.map((m) => `- ${m}`).join('\n')}

## Başlatma:
\`\`\`bash
docker compose up -d
\`\`\`
`;

  saveStackFiles(targetDir, [
    { filename: 'docker-compose.yml', content: composeContent },
    { filename: '.env', content: envContent },
    { filename: 'start.sh', content: startScript },
    { filename: 'README.md', content: readmeContent },
  ]);

  try {
    fs.chmodSync(path.join(targetDir, 'start.sh'), 0o755);
  } catch {}

  s.stop('Şablon dosyaları başarıyla üretildi.');

  p.note(
    `📂 Dizin: ${pc.cyan(targetDir)}\n` +
    `📄 docker-compose.yml (DIN 40719 Uyumlu)\n` +
    `🚀 Başlatmak için: cd ${targetDirInput} && docker compose up -d`,
    `${template.title} Hazır`
  );

  let shouldStart = false;
  if (options.start === false) {
    shouldStart = false;
  } else if (isNonInteractive) {
    shouldStart = Boolean(options.start === true);
  } else {
    const confirmStart = await p.confirm({
      message: 'Şablon konteynerlerini şimdi Docker ile başlatmak istiyor musunuz?',
      initialValue: true,
    });
    if (!p.isCancel(confirmStart) && confirmStart) {
      shouldStart = true;
    }
  }

  if (shouldStart) {
    const runSpinner = p.spinner();
    runSpinner.start('Docker Compose başlatılıyor...');
    const res = await executeDockerCompose(targetDir);
    if (res.success) {
      runSpinner.stop('✓ Tüm şablon servisleri başarıyla ayağa kaldırıldı!');
    } else {
      runSpinner.stop(pc.yellow('⚠ Konteynerler doğrudan başlatılamadı:'));
      console.log(pc.dim(res.output));
    }
  }

  p.outro(pc.bold(pc.magenta(`🎉 ${template.title} şablonu başarıyla kuruldu!`)));
}

export async function runTemplateCatalog(): Promise<void> {
  p.intro(formatBadge('🌟 33 ENDÜSTRİYEL ŞABLON KATALOĞU (Full Stacks)', 'violet'));

  const catOptions = TEMPLATE_CATEGORIES.map((c) => ({
    value: c.id,
    label: `${c.icon} ${c.label}`,
  }));

  const catChoice = await p.select({
    message: 'Hangi kategorideki mimari şablonları incelemek istersiniz?',
    options: catOptions,
  });

  if (p.isCancel(catChoice)) return;

  const templates = getTemplatesByCategory(catChoice as TemplateCategory);
  if (templates.length === 0) {
    p.note('Bu kategoride şablon bulunamadı.', 'Bilgi');
    return;
  }

  const selectedTemplateId = await p.select({
    message: `Mimari Şablon Seçin (${templates.length} adet):`,
    options: templates.map((t) => ({
      value: t.id,
      label: `${t.icon} ${t.title} [${t.difficulty} | ~${t.minRamGB}GB RAM]`,
      hint: t.subtitle,
    })),
  });

  if (p.isCancel(selectedTemplateId)) return;

  const t = getTemplate(selectedTemplateId as string);
  if (t) {
    await deployTemplate(t);
  }
}

export async function runDirectTemplateInstall(templateId: string, options: DeployTemplateOptions = {}): Promise<void> {
  const t = getTemplate(templateId);
  if (t) {
    await deployTemplate(t, options);
  } else {
    console.log(pc.red(`❌ Hata: "${templateId}" adında bir şablon bulunamadı.`));
    console.log(pc.cyan('Tüm 33 şablonu listelemek için: xivizley\n'));
  }
}
