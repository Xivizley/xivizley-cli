import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { printBanner, formatBadge } from './ui/banner.js';
import { runSuiteInstaller } from './ecosystem/suite.js';
import { runStandaloneAppStore, runDirectAppInstall } from './apps/installer.js';
import { runTemplateCatalog, runDirectTemplateInstall } from './templates/installer.js';
import { runVdsDoctor } from './ecosystem/doctor.js';
import { runDisasterRecoveryGenerator } from './ecosystem/backup.js';
import { runBlueprintSync } from './ecosystem/blueprint.js';

export async function launchInteractiveTUI(): Promise<void> {
  printBanner();

  const action = await p.select({
    message: 'XIVIZLEY Industrial Engine — Ne yapmak istersiniz?',
    options: [
      {
        value: 'suite',
        label: '👑 XIVIZLEY Cloud Suite',
        hint: 'Amiral Gemisi Bulut Paketi (Nextcloud + Passwords + Pulse + Game + Caddy)',
      },
      {
        value: 'apps',
        label: '📦 Tekil Uygulama Mağazası (112+ Servis)',
        hint: 'Arama, kategoriler, tekil ve çoklu port çakışmasız kurulum',
      },
      {
        value: 'templates',
        label: '🌟 31 Endüstriyel Şablon Kataloğu (Full Stacks)',
        hint: 'DIN 40719 standartlarında AI, E-Ticaret, Medya, Oyun ve DevOps mimarileri',
      },
      {
        value: 'sync',
        label: '🌐 XIVIZLEY Blueprint Sync',
        hint: 'xivizley.com.tr üzerindeki mimariyi çekip sunucunuza kurun',
      },
      {
        value: 'doctor',
        label: '🛡️ XIVIZLEY VDS Doktoru & Port Radarı',
        hint: 'Pre-flight port çakışma taraması, Docker ve RAM/CPU sağlık teşhisi',
      },
      {
        value: 'backup',
        label: '💾 XIVIZLEY Felaket Kurtarma Motoru',
        hint: 'Otomatik backup.sh & restore.sh betik üreticisi',
      },
      {
        value: 'exit',
        label: '🚪 Çıkış',
        hint: 'Terminalden çık',
      },
    ],
  });

  if (p.isCancel(action) || action === 'exit') {
    p.outro(pc.dim('XIVIZLEY ile çalıştığınız için teşekkürler. Güle güle!'));
    process.exit(0);
  }

  switch (action) {
    case 'suite':
      await runSuiteInstaller();
      break;
    case 'apps':
      await runStandaloneAppStore();
      break;
    case 'templates':
      await runTemplateCatalog();
      break;
    case 'sync':
      await runBlueprintSync();
      break;
    case 'doctor':
      await runVdsDoctor();
      break;
    case 'backup':
      await runDisasterRecoveryGenerator();
      break;
  }
}

export function createCli(): Command {
  const program = new Command();

  program
    .name('xivizley')
    .description('XIVIZLEY Industrial Server & Cloud Ecosystem Interactive CLI Engine')
    .version('1.0.0', '-v, --version', 'XIVIZLEY sürümünü gösterir');

  program
    .command('suite')
    .description('👑 XIVIZLEY Cloud Suite kurulum sihirbazını doğrudan başlatır')
    .action(async () => {
      printBanner();
      await runSuiteInstaller();
    });

  program
    .command('install [app]')
    .description('📦 Belirtilen tekil uygulamayı doğrudan yapılandırıp kurar (Örn: xivizley install jellyfin)')
    .action(async (app?: string) => {
      printBanner();
      if (app) {
        await runDirectAppInstall(app);
      } else {
        await runStandaloneAppStore();
      }
    });

  program
    .command('apps')
    .description('📦 112+ Tekil Uygulama Mağazasını açar')
    .action(async () => {
      printBanner();
      await runStandaloneAppStore();
    });

  program
    .command('templates [id]')
    .alias('template')
    .description('🌟 31 Endüstriyel Şablon Kataloğunu açar veya belirtilen şablonu kurar')
    .action(async (id?: string) => {
      printBanner();
      if (id) {
        await runDirectTemplateInstall(id);
      } else {
        await runTemplateCatalog();
      }
    });

  program
    .command('doctor')
    .description('🛡️ VDS Doktoru ve Port Çakışma Radarını doğrudan çalıştırır')
    .action(async () => {
      printBanner();
      await runVdsDoctor();
    });

  program
    .command('backup')
    .description('💾 Felaket Kurtarma ve otomatik yedekleme betiklerini üretir')
    .action(async () => {
      printBanner();
      await runDisasterRecoveryGenerator();
    });

  program
    .command('sync [id]')
    .description('🌐 xivizley.com.tr üzerindeki bir mimari blueprintini çeker')
    .action(async (id?: string) => {
      printBanner();
      await runBlueprintSync(id);
    });

  program.action(async () => {
    await launchInteractiveTUI();
  });

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const cli = createCli();
  await cli.parseAsync(argv);
}

// Only auto-run if directly invoked via node dist/index.js
let isDirectRun = false;
try {
  if (process.argv[1]) {
    const realArgv1 = fs.realpathSync(process.argv[1]);
    const selfPath = fileURLToPath(import.meta.url);
    isDirectRun = realArgv1 === selfPath;
  }
} catch {
  isDirectRun = false;
}

if (isDirectRun) {
  run(process.argv);
}
