import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { dump } from 'js-yaml';
import { saveStackFiles, executeDockerCompose, isPortInUse } from '../utils/system.js';
import { formatBadge } from '../ui/banner.js';

export interface SuiteConfig {
  domainOrIp: string;
  adminEmail: string;
  enableNextcloud: boolean;
  enableVaultwarden: boolean;
  enablePulse: boolean;
  enableGameCockpit: boolean;
  enableCaddy: boolean;
  targetDir: string;
}

export function isIpAddress(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1') return true;
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(host)) return true;
  return host.includes(':'); // IPv6
}

export function generateSecurePassword(length = 24): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

export function buildSuiteCompose(config: SuiteConfig) {
  const postgresPassword = generateSecurePassword();
  const nextcloudSecret = generateSecurePassword();
  const nextcloudAdminUser = 'admin';
  const nextcloudAdminPassword = generateSecurePassword(16);
  const vaultwardenAdminToken = generateSecurePassword();
  const isIp = isIpAddress(config.domainOrIp);

  const services: Record<string, any> = {
    postgres: {
      image: 'postgres:16-alpine',
      container_name: 'xivizley_suite_postgres',
      restart: 'unless-stopped',
      environment: {
        POSTGRES_DB: 'xivizley_suite',
        POSTGRES_USER: 'xivizley',
        POSTGRES_PASSWORD: postgresPassword,
      },
      volumes: ['./data/postgres:/var/lib/postgresql/data'],
      networks: ['xivizley_suite_net'],
      healthcheck: {
        test: ['CMD-SHELL', 'pg_isready -U xivizley'],
        interval: '5s',
        timeout: '5s',
        retries: 5,
      },
    },
    redis: {
      image: 'redis:7-alpine',
      container_name: 'xivizley_suite_redis',
      restart: 'unless-stopped',
      command: ['redis-server', '--appendonly', 'yes'],
      volumes: ['./data/redis:/data'],
      networks: ['xivizley_suite_net'],
    },
  };

  if (config.enableNextcloud) {
    services['nextcloud'] = {
      image: 'nextcloud:apache',
      container_name: 'xivizley_suite_nextcloud',
      restart: 'unless-stopped',
      depends_on: { postgres: { condition: 'service_healthy' }, redis: { condition: 'service_started' } },
      environment: {
        POSTGRES_HOST: 'postgres',
        POSTGRES_DB: 'xivizley_suite',
        POSTGRES_USER: 'xivizley',
        POSTGRES_PASSWORD: postgresPassword,
        REDIS_HOST: 'redis',
        NEXTCLOUD_ADMIN_USER: nextcloudAdminUser,
        NEXTCLOUD_ADMIN_PASSWORD: nextcloudAdminPassword,
        NEXTCLOUD_TRUSTED_DOMAINS: `${config.domainOrIp} localhost 127.0.0.1`,
      },
      volumes: ['./data/nextcloud:/var/www/html'],
      networks: ['xivizley_suite_net'],
      ports: config.enableCaddy ? [] : ['8080:80'],
    };
  }

  if (config.enableVaultwarden) {
    services['vaultwarden'] = {
      image: 'vaultwarden/server:latest',
      container_name: 'xivizley_suite_vaultwarden',
      restart: 'unless-stopped',
      environment: {
        ADMIN_TOKEN: vaultwardenAdminToken,
        SIGNUPS_ALLOWED: 'true',
        WEBSOCKET_ENABLED: 'true',
      },
      volumes: ['./data/vaultwarden:/data'],
      networks: ['xivizley_suite_net'],
      ports: config.enableCaddy ? [] : ['8081:80', '3012:3012'],
    };
  }

  if (config.enablePulse) {
    services['pulse_sentinel'] = {
      image: 'louislam/uptime-kuma:1',
      container_name: 'xivizley_suite_pulse',
      restart: 'unless-stopped',
      volumes: ['./data/pulse:/app/data'],
      networks: ['xivizley_suite_net'],
      ports: config.enableCaddy ? [] : ['3001:3001'],
    };
  }

  if (config.enableGameCockpit) {
    services['game_cockpit'] = {
      image: 'portainer/portainer-ce:latest',
      container_name: 'xivizley_suite_game_cockpit',
      restart: 'unless-stopped',
      volumes: [
        '/var/run/docker.sock:/var/run/docker.sock',
        './data/portainer:/data',
      ],
      networks: ['xivizley_suite_net'],
      ports: config.enableCaddy ? [] : ['9443:9443', '9000:9000'],
    };
  }

  if (config.enableCaddy) {
    const caddyPorts = isIp
      ? ['80:80', '8080:8080', '8081:8081', '3001:3001', '9000:9000']
      : ['80:80', '443:443'];

    services['caddy'] = {
      image: 'caddy:alpine',
      container_name: 'xivizley_suite_caddy',
      restart: 'unless-stopped',
      ports: caddyPorts,
      volumes: [
        './Caddyfile:/etc/caddy/Caddyfile',
        './data/caddy_data:/data',
        './data/caddy_config:/config',
      ],
      networks: ['xivizley_suite_net'],
    };
  }

  const compose = {
    version: '3.8',
    services,
    networks: {
      xivizley_suite_net: {
        driver: 'bridge',
      },
    },
  };

  const yamlContent = dump(compose, { indent: 2, lineWidth: -1 });

  // Generate Caddyfile
  let caddyfile = `# XIVIZLEY Cloud Suite - Reverse Proxy Configuration\n`;
  if (!isIp) {
    caddyfile += `{\n  email ${config.adminEmail}\n}\n\n`;
    if (config.enableNextcloud) {
      caddyfile += `cloud.${config.domainOrIp} {\n  reverse_proxy nextcloud:80\n}\n\n`;
    }
    if (config.enableVaultwarden) {
      caddyfile += `pass.${config.domainOrIp} {\n  reverse_proxy vaultwarden:80\n}\n\n`;
    }
    if (config.enablePulse) {
      caddyfile += `pulse.${config.domainOrIp} {\n  reverse_proxy pulse_sentinel:3001\n}\n\n`;
    }
    if (config.enableGameCockpit) {
      caddyfile += `game.${config.domainOrIp} {\n  reverse_proxy game_cockpit:9000\n}\n\n`;
    }
  } else {
    caddyfile += `{\n  auto_https off\n}\n\n`;
    caddyfile += `:80 {\n  respond "XIVIZLEY Cloud Suite is active! Nextcloud (:8080), Vaultwarden (:8081), Pulse (:3001), Cockpit (:9000)"\n}\n\n`;
    if (config.enableNextcloud) {
      caddyfile += `:8080 {\n  reverse_proxy nextcloud:80\n}\n\n`;
    }
    if (config.enableVaultwarden) {
      caddyfile += `:8081 {\n  reverse_proxy vaultwarden:80\n}\n\n`;
    }
    if (config.enablePulse) {
      caddyfile += `:3001 {\n  reverse_proxy pulse_sentinel:3001\n}\n\n`;
    }
    if (config.enableGameCockpit) {
      caddyfile += `:9000 {\n  reverse_proxy game_cockpit:9000\n}\n\n`;
    }
  }

  let envContent = `# XIVIZLEY Cloud Suite Environment Configuration
POSTGRES_PASSWORD=${postgresPassword}
VAULTWARDEN_ADMIN_TOKEN=${vaultwardenAdminToken}
HOST_DOMAIN_OR_IP=${config.domainOrIp}
ADMIN_EMAIL=${config.adminEmail}
`;

  if (config.enableNextcloud) {
    envContent += `NEXTCLOUD_ADMIN_USER=${nextcloudAdminUser}
NEXTCLOUD_ADMIN_PASSWORD=${nextcloudAdminPassword}
`;
  }

  const startScript = `#!/usr/bin/env bash
set -e
echo "🚀 XIVIZLEY Cloud Suite Başlatılıyor..."
docker compose pull
docker compose up -d
echo "✅ XIVIZLEY Cloud Suite başarıyla ayağa kalktı!"
echo "   Panel ve servislerinize ${config.domainOrIp} üzerinden erişebilirsiniz."
`;

  return {
    yamlContent,
    caddyfile,
    envContent,
    startScript,
    credentials: {
      postgresPassword,
      nextcloudAdminUser,
      nextcloudAdminPassword,
      vaultwardenAdminToken,
    },
  };
}

export async function runSuiteInstaller(): Promise<void> {
  p.intro(formatBadge('👑 XIVIZLEY CLOUD SUITE SİHİRBAZI', 'violet'));

  const domainOrIp = await p.text({
    message: 'Sunucu Alan Adı (Domain) veya Statik IP Adresiniz:',
    placeholder: 'cloud.ornek.com veya 192.168.1.100',
    initialValue: 'localhost',
    validate: (val) => {
      if (!val || val.trim().length === 0) return 'Lütfen geçerli bir IP veya domain girin.';
    },
  });

  if (p.isCancel(domainOrIp)) {
    p.cancel('Kurulum iptal edildi.');
    return;
  }

  const adminEmail = await p.text({
    message: 'Yönetici E-Posta Adresi (SSL ve Bildirimler için):',
    placeholder: 'admin@ornek.com',
    initialValue: 'admin@xivizley.local',
  });

  if (p.isCancel(adminEmail)) {
    p.cancel('Kurulum iptal edildi.');
    return;
  }

  const components = await p.multiselect({
    message: 'Kurulacak XIVIZLEY Suite Bileşenlerini Seçin:',
    options: [
      { value: 'nextcloud', label: '☁️ Nextcloud Hub & Drive (Bulut Dosya & Ofis)', hint: 'Önerilen' },
      { value: 'vaultwarden', label: '🔐 Passwords / Vaultwarden (Şifre Yöneticisi)', hint: 'Önerilen' },
      { value: 'pulse', label: '📡 Pulse Sentinel (Canlı İzleme & Uptime Kuma)', hint: 'Önerilen' },
      { value: 'game', label: '🎮 Game Cockpit (Oyun Sunucuları & Portainer Paneli)', hint: 'Önerilen' },
      { value: 'caddy', label: '🛡️ Caddy Reverse Proxy (Otomatik HTTPS SSL)', hint: 'Önerilen' },
    ],
    initialValues: ['nextcloud', 'vaultwarden', 'pulse', 'game', 'caddy'],
    required: true,
  });

  if (p.isCancel(components)) {
    p.cancel('Kurulum iptal edildi.');
    return;
  }

  const targetDirInput = await p.text({
    message: 'Kurulum Yapılacak Dizin:',
    initialValue: './xivizley-suite',
  });

  if (p.isCancel(targetDirInput)) {
    p.cancel('Kurulum iptal edildi.');
    return;
  }

  const targetDir = path.resolve(process.cwd(), targetDirInput);

  const selectedSet = new Set(components as string[]);
  const config: SuiteConfig = {
    domainOrIp: domainOrIp.trim(),
    adminEmail: adminEmail.trim(),
    enableNextcloud: selectedSet.has('nextcloud'),
    enableVaultwarden: selectedSet.has('vaultwarden'),
    enablePulse: selectedSet.has('pulse'),
    enableGameCockpit: selectedSet.has('game'),
    enableCaddy: selectedSet.has('caddy'),
    targetDir,
  };

  const s = p.spinner();
  s.start('XIVIZLEY Cloud Suite yapılandırması ve şifreleri üretiliyor...');

  const { yamlContent, caddyfile, envContent, startScript, credentials } = buildSuiteCompose(config);

  const files = [
    { filename: 'docker-compose.yml', content: yamlContent },
    { filename: '.env', content: envContent },
    { filename: 'start.sh', content: startScript },
    { filename: 'Caddyfile', content: caddyfile },
  ];

  saveStackFiles(targetDir, files);
  try {
    fs.chmodSync(path.join(targetDir, 'start.sh'), 0o755);
  } catch {}

  s.stop('Konfigürasyon dosyaları başarıyla oluşturuldu.');

  let credNotes = '';
  if (config.enableNextcloud) {
    credNotes += `👤 Nextcloud Admin: ${credentials.nextcloudAdminUser} / ${credentials.nextcloudAdminPassword}\n`;
  }
  if (config.enableVaultwarden) {
    credNotes += `🔐 Vaultwarden Token: ${credentials.vaultwardenAdminToken.slice(0, 12)}...\n`;
  }

  p.note(
    `📂 Dizin: ${pc.cyan(targetDir)}\n` +
    credNotes +
    `📄 docker-compose.yml (Üretildi)\n` +
    `🔑 .env (Güvenli Şifreler Kaydedildi)\n` +
    `🛡️ Caddyfile (SSL / Proxy Yapılandırıldı)\n` +
    `🚀 start.sh (Yürütülebilir Betik Hazır)`,
    'Kurulum Özeti'
  );

  const shouldStart = await p.confirm({
    message: 'Docker konteynerlerini şimdi arka planda başlatmak istiyor musunuz?',
    initialValue: true,
  });

  if (!p.isCancel(shouldStart) && shouldStart) {
    const runSpinner = p.spinner();
    runSpinner.start('Docker Compose başlatılıyor...');
    const result = await executeDockerCompose(targetDir);
    if (result.success) {
      runSpinner.stop('✓ Tüm servisler başarıyla ayağa kaldırıldı!');
    } else {
      runSpinner.stop(pc.yellow('⚠ Docker doğrudan başlatılamadı (Docker Engine çalışmıyor olabilir):'));
      console.log(pc.dim(result.output));
      console.log(pc.cyan(`\nManuel başlatmak için: cd ${targetDirInput} && docker compose up -d\n`));
    }
  }

  p.outro(pc.bold(pc.magenta('👑 XIVIZLEY Cloud Suite Kurulumu Tamamlandı!')));
}
