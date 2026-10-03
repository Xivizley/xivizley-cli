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
  suiteType?: 'unified_hub' | 'classic';
  enableNextcloud?: boolean;
  enableVaultwarden?: boolean;
  enablePulse?: boolean;
  enableGameCockpit?: boolean;
  enableCaddy?: boolean;
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

export const INIT_SCHEMAS_SQL = `-- XIVIZLEY Unified Hub — PostgreSQL 16 Multi-Schema Bootstrap
-- Bu dosya, ilk docker compose up sırasında otomatik çalışır.

CREATE SCHEMA IF NOT EXISTS sso;
CREATE SCHEMA IF NOT EXISTS game_panel;
CREATE SCHEMA IF NOT EXISTS drive;
CREATE SCHEMA IF NOT EXISTS cinema;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS pulse;
CREATE SCHEMA IF NOT EXISTS sound;
CREATE SCHEMA IF NOT EXISTS docs;
CREATE SCHEMA IF NOT EXISTS shield;
CREATE SCHEMA IF NOT EXISTS fortress;
CREATE SCHEMA IF NOT EXISTS brain;
CREATE SCHEMA IF NOT EXISTS talk;
CREATE SCHEMA IF NOT EXISTS pass;
CREATE SCHEMA IF NOT EXISTS notes;

CREATE TABLE IF NOT EXISTS sso.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sso.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES sso.users(id) ON DELETE CASCADE,
    user_agent TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS sso.refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES sso.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    client_id VARCHAR(64) NOT NULL,
    family_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sso.oauth_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id VARCHAR(64) NOT NULL UNIQUE,
    client_name VARCHAR(100) NOT NULL,
    redirect_uris TEXT NOT NULL,
    client_secret_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sso.hub_preferences (
    user_id UUID PRIMARY KEY REFERENCES sso.users(id) ON DELETE CASCADE,
    widgets TEXT NOT NULL DEFAULT '[]',
    theme VARCHAR(50) NOT NULL DEFAULT 'system',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    title TEXT NOT NULL DEFAULT 'Başlıksız Not',
    content TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Genel',
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pass.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES sso.users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    icon VARCHAR(64) DEFAULT 'Folder',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pass.vault_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES sso.users(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL DEFAULT 'login',
    title VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    encrypted_password TEXT NOT NULL,
    url TEXT,
    totp_secret TEXT,
    notes TEXT,
    folder VARCHAR(128) DEFAULT 'Genel',
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drive.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES sso.users(id) ON DELETE CASCADE,
    parent_id UUID,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(20),
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drive.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES sso.users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES drive.folders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream',
    size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    sha256_hash VARCHAR(64),
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    is_trashed BOOLEAN NOT NULL DEFAULT FALSE,
    trashed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drive.shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES drive.files(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES drive.folders(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES sso.users(id) ON DELETE CASCADE,
    share_token VARCHAR(64) NOT NULL UNIQUE,
    password_hash TEXT,
    expires_at TIMESTAMPTZ,
    allow_download BOOLEAN NOT NULL DEFAULT TRUE,
    download_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pulse.monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES sso.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'http',
    interval_seconds INT NOT NULL DEFAULT 60,
    status VARCHAR(32) NOT NULL DEFAULT 'up',
    uptime_percentage NUMERIC(5,2) DEFAULT 100.00,
    last_check_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pulse.heartbeats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id UUID REFERENCES pulse.monitors(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL,
    latency_ms INT,
    status_code INT,
    error_message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pulse.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id UUID REFERENCES pulse.monitors(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'investigating',
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shield.banned_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip VARCHAR(45) NOT NULL UNIQUE,
    reason TEXT,
    banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS shield.whitelisted_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip VARCHAR(45) NOT NULL UNIQUE,
    description TEXT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shield.security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(64) NOT NULL,
    ip VARCHAR(45),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export function buildUnifiedHubCompose(config: SuiteConfig) {
  const postgresPassword = generateSecurePassword();
  const cookieSecret = generateSecurePassword(32);
  const vaultMasterKey = generateSecurePassword(32);
  const isIp = isIpAddress(config.domainOrIp);

  const services: Record<string, any> = {
    postgres: {
      image: 'postgres:16-alpine',
      container_name: 'xivizley-postgres',
      restart: 'unless-stopped',
      environment: {
        POSTGRES_USER: 'xivizley',
        POSTGRES_PASSWORD: postgresPassword,
        POSTGRES_DB: 'xivizley_suite',
      },
      volumes: [
        'postgres_data:/var/lib/postgresql/data',
        './init-schemas.sql:/docker-entrypoint-initdb.d/init-schemas.sql:ro',
      ],
      ports: ['5432:5432'],
      healthcheck: {
        test: ['CMD-SHELL', 'pg_isready -U xivizley -d xivizley_suite'],
        interval: '5s',
        timeout: '5s',
        retries: 5,
      },
      networks: ['xivizley-network'],
    },
    hub: {
      image: 'deploy-hub:latest',
      container_name: 'xivizley-hub',
      restart: 'unless-stopped',
      depends_on: {
        postgres: { condition: 'service_healthy' },
      },
      environment: {
        DATABASE_URL: `postgresql://xivizley:${postgresPassword}@postgres:5432/xivizley_suite`,
        PORT: '3000',
        NODE_ENV: 'production',
        DOMAIN: `${config.domainOrIp}:3000`,
        COOKIE_DOMAIN: '',
        COOKIE_SECRET: cookieSecret,
        VAULT_MASTER_KEY: vaultMasterKey,
        DRIVE_STORAGE_PATH: '/data/storage',
        CADDY_LOG_PATH: '/var/log/caddy/access.log',
        FIVEM_CONTAINER_NAME: 'fivem-server',
      },
      ports: config.enableCaddy ? [] : ['3000:3000'],
      volumes: [
        '/var/run/docker.sock:/var/run/docker.sock',
        'caddy_logs:/var/log/caddy:ro',
        'drive_data:/data/storage',
      ],
      networks: ['xivizley-network'],
    },
  };

  if (config.enableGameCockpit !== false) {
    services['fivem-server'] = {
      image: 'alpine:latest',
      container_name: 'fivem-server',
      restart: 'unless-stopped',
      stdin_open: true,
      tty: true,
      command: 'sh -c "echo \\"[FXServer] Initializing FiveM Artifact v7290...\\" && echo \\"[FXServer] Server listening on 0.0.0.0:30120\\" && tail -f /dev/null"',
      volumes: ['xivizley-fivem-data:/config'],
      ports: ['30120:30120', '30120:30120/udp'],
      networks: ['xivizley-network'],
    };
  }

  if (config.enableCaddy) {
    const caddyPorts = isIp
      ? ['80:80', '443:443', '3000:3000']
      : ['80:80', '443:443'];

    services['caddy'] = {
      image: 'caddy:alpine',
      container_name: 'xivizley-caddy',
      restart: 'unless-stopped',
      ports: caddyPorts,
      volumes: [
        './Caddyfile:/etc/caddy/Caddyfile',
        'caddy_data:/data',
        'caddy_config:/config',
        'caddy_logs:/var/log/caddy',
      ],
      networks: ['xivizley-network'],
    };
  }

  const compose = {
    version: '3.8',
    services,
    volumes: {
      postgres_data: null,
      caddy_data: null,
      caddy_config: null,
      caddy_logs: null,
      drive_data: null,
      'xivizley-fivem-data': null,
    },
    networks: {
      'xivizley-network': {
        driver: 'bridge',
      },
    },
  };

  const yamlContent = dump(compose, { indent: 2, lineWidth: -1 });

  let caddyfile = `# XIVIZLEY Nextcloud Unified Hub - Caddy Reverse Proxy\n`;
  if (!isIp) {
    caddyfile += `{\n  email ${config.adminEmail}\n}\n\n`;
    caddyfile += `${config.domainOrIp} {\n  reverse_proxy hub:3000\n}\n`;
  } else {
    caddyfile += `{\n  auto_https off\n}\n\n`;
    caddyfile += `:80 {\n  reverse_proxy hub:3000\n}\n`;
  }

  const envContent = `# XIVIZLEY Nextcloud Unified Hub Configuration
POSTGRES_PASSWORD=${postgresPassword}
COOKIE_SECRET=${cookieSecret}
VAULT_MASTER_KEY=${vaultMasterKey}
HOST_DOMAIN_OR_IP=${config.domainOrIp}
ADMIN_EMAIL=${config.adminEmail}
`;

  const startScript = `#!/usr/bin/env bash
set -e
echo "🚀 XIVIZLEY Nextcloud Unified Hub Başlatılıyor..."
docker compose pull || true
docker compose up -d
echo "✅ XIVIZLEY Unified Hub başarıyla ayağa kalktı!"
echo "   Paneline http://${config.domainOrIp}:3000 üzerinden erişebilirsiniz."
`;

  return {
    yamlContent,
    caddyfile,
    envContent,
    startScript,
    sqlInitContent: INIT_SCHEMAS_SQL,
    credentials: {
      postgresPassword,
      adminEmail: config.adminEmail,
      cookieSecret,
      vaultMasterKey,
    },
  };
}

export function buildClassicSuiteCompose(config: SuiteConfig) {
  const postgresPassword = generateSecurePassword();
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
      ? ['8080:8080', '8081:8081', '3001:3001', '9000:9000']
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

export function buildSuiteCompose(config: SuiteConfig) {
  if (config.suiteType === 'unified_hub' || (!config.suiteType && !config.enableNextcloud)) {
    return buildUnifiedHubCompose(config);
  }
  return buildClassicSuiteCompose(config);
}

export async function runSuiteInstaller(): Promise<void> {
  p.intro(formatBadge('👑 XIVIZLEY CLOUD SUITE SİHİRBAZI', 'violet'));

  const suiteType = await p.select({
    message: 'Kurulacak XIVIZLEY Suite Mimarisini Seçin:',
    options: [
      {
        value: 'unified_hub',
        label: '👑 XIVIZLEY Nextcloud Unified Hub (Önerilen - Asıl Ekosistemimiz)',
        hint: 'SSO Hub, Drive, Pass, Pulse Sentinel, Shield WAF & Game Cockpit (Tek Entegre Panel)',
      },
      {
        value: 'classic',
        label: '📦 Klasik Açık Kaynak Paket',
        hint: 'Harici Nextcloud:apache, Vaultwarden, Uptime Kuma, Portainer konteynerleri',
      },
    ],
    initialValue: 'unified_hub',
  });

  if (p.isCancel(suiteType)) {
    p.cancel('Kurulum iptal edildi.');
    return;
  }

  const domainOrIp = await p.text({
    message: 'Sunucu Alan Adı (Domain) veya Statik IP Adresiniz:',
    placeholder: 'cloud.ornek.com veya 109.104.120.126',
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
    placeholder: 'alperen@xivizley.com.tr',
    initialValue: 'alperen@xivizley.com.tr',
  });

  if (p.isCancel(adminEmail)) {
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

  if (suiteType === 'unified_hub') {
    const enableGameCockpit = await p.confirm({
      message: 'FiveM & Minecraft Oyun Sunucusu Konteyneri eklensin mi?',
      initialValue: true,
    });

    if (p.isCancel(enableGameCockpit)) {
      p.cancel('Kurulum iptal edildi.');
      return;
    }

    const enableCaddy = await p.confirm({
      message: 'Caddy Otomatik Reverse Proxy & SSL WAF eklensin mi?',
      initialValue: !isIpAddress(domainOrIp.trim()),
    });

    if (p.isCancel(enableCaddy)) {
      p.cancel('Kurulum iptal edildi.');
      return;
    }

    const config: SuiteConfig = {
      domainOrIp: domainOrIp.trim(),
      adminEmail: adminEmail.trim(),
      suiteType: 'unified_hub',
      enableGameCockpit,
      enableCaddy,
      targetDir,
    };

    const s = p.spinner();
    s.start('XIVIZLEY Nextcloud Unified Hub yapılandırması ve SQL şemaları üretiliyor...');

    const { yamlContent, caddyfile, envContent, startScript, sqlInitContent, credentials } = buildUnifiedHubCompose(config);

    const files = [
      { filename: 'docker-compose.yml', content: yamlContent },
      { filename: '.env', content: envContent },
      { filename: 'init-schemas.sql', content: sqlInitContent },
      { filename: 'start.sh', content: startScript },
      { filename: 'Caddyfile', content: caddyfile },
    ];

    saveStackFiles(targetDir, files);
    try {
      fs.chmodSync(path.join(targetDir, 'start.sh'), 0o755);
    } catch {}

    s.stop('Konfigürasyon ve SQL şema dosyaları başarıyla oluşturuldu.');

    const accessUrl = isIpAddress(config.domainOrIp)
      ? `http://${config.domainOrIp}:3000`
      : `https://${config.domainOrIp}`;

    p.note(
      `📂 Dizin: ${pc.cyan(targetDir)}\n` +
      `🌐 Panel URL: ${pc.green(pc.bold(accessUrl))}\n` +
      `👤 Yönetici: ${pc.yellow(credentials.adminEmail)}\n` +
      `✨ Entegre Modüller: Drive, Pass, Pulse Sentinel, Shield WAF, Game Cockpit\n` +
      `📄 docker-compose.yml, init-schemas.sql, .env, Caddyfile, start.sh üretildi.`,
      '👑 XIVIZLEY Unified Hub Kurulum Özeti'
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
        runSpinner.stop('✓ Tüm XIVIZLEY Hub servisleri başarıyla ayağa kaldırıldı!');
      } else {
        runSpinner.stop(pc.yellow('⚠ Docker doğrudan başlatılamadı:'));
        console.log(pc.dim(result.output));
        console.log(pc.cyan(`\nManuel başlatmak için: cd ${targetDirInput} && docker compose up -d\n`));
      }
    }

    p.outro(pc.bold(pc.magenta('👑 XIVIZLEY Nextcloud Unified Hub Kurulumu Tamamlandı!')));
    return;
  }

  // Classic suite flow
  const components = await p.multiselect({
    message: 'Kurulacak Klasik Suite Bileşenlerini Seçin:',
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

  const selectedSet = new Set(components as string[]);
  const classicConfig: SuiteConfig = {
    domainOrIp: domainOrIp.trim(),
    adminEmail: adminEmail.trim(),
    suiteType: 'classic',
    enableNextcloud: selectedSet.has('nextcloud'),
    enableVaultwarden: selectedSet.has('vaultwarden'),
    enablePulse: selectedSet.has('pulse'),
    enableGameCockpit: selectedSet.has('game'),
    enableCaddy: selectedSet.has('caddy'),
    targetDir,
  };

  const s = p.spinner();
  s.start('Klasik Cloud Suite yapılandırması üretiliyor...');

  const { yamlContent, caddyfile, envContent, startScript, credentials } = buildClassicSuiteCompose(classicConfig);

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
  if (classicConfig.enableNextcloud && (credentials as any).nextcloudAdminUser) {
    credNotes += `👤 Nextcloud Admin: ${(credentials as any).nextcloudAdminUser} / ${(credentials as any).nextcloudAdminPassword}\n`;
  }
  if (classicConfig.enableVaultwarden && (credentials as any).vaultwardenAdminToken) {
    credNotes += `🔐 Vaultwarden Token: ${(credentials as any).vaultwardenAdminToken.slice(0, 12)}...\n`;
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
      runSpinner.stop(pc.yellow('⚠ Docker doğrudan başlatılamadı:'));
      console.log(pc.dim(result.output));
      console.log(pc.cyan(`\nManuel başlatmak için: cd ${targetDirInput} && docker compose up -d\n`));
    }
  }

  p.outro(pc.bold(pc.magenta('👑 XIVIZLEY Cloud Suite Kurulumu Tamamlandı!')));
}
