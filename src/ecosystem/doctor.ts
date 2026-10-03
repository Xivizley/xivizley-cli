import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getSystemHealth, scanPorts } from '../utils/system.js';
import { formatBadge } from '../ui/banner.js';

export async function runVdsDoctor(): Promise<void> {
  p.intro(formatBadge('🛡️ XIVIZLEY VDS DOKTORU & PORT RADARI', 'violet'));

  const s = p.spinner();
  s.start('Sunucu donanımı, Docker daemon ve portlar taranıyor...');

  const health = getSystemHealth();

  const standardPorts = [
    { port: 22, name: 'SSH' },
    { port: 53, name: 'DNS' },
    { port: 80, name: 'HTTP Web' },
    { port: 443, name: 'HTTPS SSL' },
    { port: 3000, name: 'Web Apps (Grafana / Node)' },
    { port: 3306, name: 'MySQL / MariaDB' },
    { port: 5432, name: 'PostgreSQL' },
    { port: 6379, name: 'Redis Cache' },
    { port: 8080, name: 'Proxy / Alt Web' },
    { port: 8443, name: 'Alt HTTPS' },
    { port: 9000, name: 'Portainer / MinIO' },
    { port: 27017, name: 'MongoDB' },
  ];

  const portScanResults = await scanPorts(standardPorts.map((x) => x.port));

  s.stop('Teşhis tamamlandı.');

  console.log(pc.bold(pc.cyan('\n  🖥️  DONANIM & İŞLETİM SİSTEMİ:')));
  console.log(pc.dim('  • Platform: ') + pc.white(`${health.platform} (${health.release}) [${health.arch}]`));
  console.log(pc.dim('  • İşlemci:  ') + pc.white(`${health.cpuModel} (${health.cpuCores} Çekirdek)`));
  const ramPercent = Math.round((health.usedRamGB / (health.totalRamGB || 1)) * 100);
  const ramColor = ramPercent > 85 ? pc.red : ramPercent > 60 ? pc.yellow : pc.green;
  console.log(pc.dim('  • Bellek:   ') + ramColor(`${health.usedRamGB} GB / ${health.totalRamGB} GB (%${ramPercent} dolu, ${health.freeRamGB} GB boş)`));

  console.log(pc.bold(pc.cyan('\n  🐳 DOCKER MOTORU DURUMU:')));
  if (health.dockerInstalled) {
    console.log(pc.green(`  ✓ Docker CLI Kurulu: ${health.dockerVersion}`));
    if (health.dockerRunning) {
      console.log(pc.green('  ✓ Docker Daemon Aktif ve Çalışıyor'));
    } else {
      console.log(pc.red('  ❌ Docker Daemon Çalışmıyor! (Konteynerleri başlatmak için "sudo systemctl start docker" yapın)'));
    }
  } else {
    console.log(pc.red('  ❌ Docker Kurulu Değil!'));
    console.log(pc.yellow('  👉 Kurulum için: curl -fsSL https://get.docker.com | sh'));
  }

  console.log(pc.bold(pc.cyan('\n  📡 PRE-FLIGHT PORT ÇAKIŞMA RADARI:')));
  let inUseCount = 0;
  for (const item of standardPorts) {
    const res = portScanResults.find((r) => r.port === item.port);
    const inUse = res?.inUse ?? false;
    if (inUse) {
      inUseCount++;
      console.log(pc.yellow(`  ⚠️  Port ${String(item.port).padEnd(6)} [KULLANIMDA]  ➔ ${item.name}`));
    } else {
      console.log(pc.green(`  ✓   Port ${String(item.port).padEnd(6)} [TEMİZ/AÇIK]  ➔ ${item.name}`));
    }
  }

  console.log('');
  if (inUseCount === 0) {
    p.note('Tüm standart sunucu portları temiz! Herhangi bir web servisini çakışma olmadan kurabilirsiniz.', 'Radar Sonucu: Mükemmel');
  } else {
    p.note(
      `${inUseCount} adet port şu anda kullanımda.\nXIVIZLEY kurulum sihirbazları çakışan portları otomatik olarak alternatif portlara yönlendirecektir.`,
      'Radar Sonucu: Yönetilebilir'
    );
  }

  p.outro(pc.bold(pc.magenta('🛡️ VDS Doktoru Raporu Tamamlandı!')));
}
