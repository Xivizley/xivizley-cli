import { test, describe } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';


import { MODULE_CATALOG } from '../dist/data/modules.js';
import { STACK_TEMPLATES } from '../dist/data/templates.js';
import { getAllModules, getModule, searchModules, getModulesByCategory, getCategories } from '../dist/apps/catalog.js';
import { getAllTemplates, getTemplate } from '../dist/templates/catalog.js';
import { buildComposeFromModules, resolvePortConflicts } from '../dist/utils/compose.js';
import { buildSuiteCompose, isIpAddress } from '../dist/ecosystem/suite.js';
import { getSystemHealth, isPortInUse } from '../dist/utils/system.js';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliBin = path.resolve(__dirname, '../bin/xivizley.mjs');

describe('XIVIZLEY Interactive CLI Engine Tests', () => {

  test('Module Catalog Integrity (134 Docker Modülü & 130+ Apps)', () => {
    assert(MODULE_CATALOG.length >= 134, `Beklenen en az 134 modül, bulunan: ${MODULE_CATALOG.length}`);
    const nonOsModules = getAllModules();
    assert(nonOsModules.length >= 130, `Bağımsız tekil app sayısı >= 130 olmalı, bulunan: ${nonOsModules.length}`);

    // Verify all standalone container modules have required properties
    for (const mod of nonOsModules) {
      assert(mod.id, 'Modül id içermeli');
      assert(mod.name, `Modül ${mod.id} isim içermeli`);
      assert(mod.category, `Modül ${mod.id} kategori içermeli`);
      assert(mod.dockerImage, `Modül ${mod.id} dockerImage içermeli`);
      assert(Array.isArray(mod.ports), `Modül ${mod.id} ports dizisi içermeli`);
      assert(Array.isArray(mod.environment), `Modül ${mod.id} environment dizisi içermeli`);
    }

    // Verify the 19 new 2026 modules are present in the catalog
    const newModuleIds = [
      'dockge', 'beszel', 'forgejo', 'prowlarr', 'bazarr', 'lidarr',
      'jellyseerr', 'tautulli', 'metube', 'pinchflat', 'homepage', 'homarr',
      'actual-budget', 'firefly-iii', 'karakeep', 'docmost', 'pairdrop',
      'gluetun', 'pangolin'
    ];
    for (const id of newModuleIds) {
      assert(MODULE_CATALOG.some(m => m.id === id), `Yeni modül ${id} katalogda bulunmalı`);
    }
  });

  test('33 Endüstriyel Şablon Kataloğu Doğrulaması', () => {
    assert.strictEqual(STACK_TEMPLATES.length, 33, 'Tam olarak 33 endüstriyel şablon bulunmalı');
    
    // Verify the 2 new 2026 templates are present
    const newTemplateIds = ['ultimate-arr-media', 'lightweight-homelab-ops'];
    for (const tid of newTemplateIds) {
      assert(STACK_TEMPLATES.some(t => t.id === tid), `Yeni şablon ${tid} katalogda bulunmalı`);
    }

    for (const t of STACK_TEMPLATES) {
      assert(t.id, 'Şablon id içermeli');
      assert(t.title, `Şablon ${t.id} title içermeli`);
      assert(t.composeSnippet, `Şablon ${t.id} composeSnippet içermeli`);
      assert(t.minRamGB > 0, `Şablon ${t.id} geçerli minRamGB içermeli`);

      // Verify composeSnippet parses as valid YAML
      const parsed = load(t.composeSnippet);
      assert(parsed && typeof parsed === 'object', `Şablon ${t.id} YAML ayrıştırması başarısız`);
      assert((parsed as any).services, `Şablon ${t.id} services alanı içermeli`);
    }
  });

  test('Tüm Tekil Uygulamalar Geçerli Docker Compose YAML Üretmeli', () => {
    const modules = getAllModules();
    for (const mod of modules) {
      const { compose, yamlString } = buildComposeFromModules([mod]);
      assert(compose.services, `${mod.id} compose services içermeli`);
      assert(yamlString.length > 0, `${mod.id} YAML dizesi boş olmamalı`);

      // Verify YAML validity
      const parsed = load(yamlString) as any;
      assert(parsed.services, `${mod.id} üretilen YAML ayrıştırılamadı`);
    }
  });

  test('Otomatik Port Çakışma Radarı ve Çözümleyici', () => {
    // Select two modules that share port 80 (caddy and traefik)
    const caddy = getModule('caddy');
    const traefik = getModule('traefik');
    assert(caddy && traefik, 'Caddy ve Traefik modülleri bulunmalı');

    const result = resolvePortConflicts([caddy, traefik]);
    assert.strictEqual(result.conflictsDetected, true, 'Port 80 çakışması tespit edilmeli');
    assert(result.log.length > 0, 'Port çakışma log mesajı üretilmeli');

    const { compose, yamlString, portLog } = buildComposeFromModules([caddy, traefik]);
    assert(portLog.length > 0, 'Compose üretiminde port çakışması raporlanmalı');

    // Check that both services have distinct host ports in generated compose
    const parsed = load(yamlString) as any;
    const caddyPorts = parsed.services.caddy.ports;
    const traefikPorts = parsed.services.traefik.ports;

    const hostPorts = new Set<string>();
    for (const p of [...caddyPorts, ...traefikPorts]) {
      const hostPart = p.split(':')[0];
      assert(!hostPorts.has(hostPart), `Port ${hostPart} yinelenmemeli, çakışma çözülmeliydi`);
      hostPorts.add(hostPart);
    }
  });

  test('XIVIZLEY Cloud Suite Compose ve Konfigürasyon Üretimi', () => {
    const suite = buildSuiteCompose({
      domainOrIp: 'cloud.test.lan',
      adminEmail: 'admin@test.lan',
      enableNextcloud: true,
      enableVaultwarden: true,
      enablePulse: true,
      enableGameCockpit: true,
      enableCaddy: true,
      targetDir: '/tmp/test-suite',
    });

    assert(suite.yamlContent.length > 0, 'Suite YAML üretilmeli');
    assert(suite.caddyfile.includes('cloud.cloud.test.lan'), 'Caddyfile alan adı subdomain içermeli');
    assert(suite.envContent.includes('POSTGRES_PASSWORD='), '.env şifre içermeli');
    assert(suite.envContent.includes('NEXTCLOUD_ADMIN_USER=admin'), '.env Nextcloud kullanıcı adı içermeli');
    assert(suite.envContent.includes('NEXTCLOUD_ADMIN_PASSWORD='), '.env Nextcloud admin şifresi içermeli');
    assert(suite.credentials.nextcloudAdminPassword.length >= 16, 'Nextcloud şifresi en az 16 karakter olmalı');
    assert(suite.startScript.includes('docker compose up -d'), 'start.sh başlatma komutu içermeli');

    const parsed = load(suite.yamlContent) as any;
    assert(parsed.services.postgres, 'Suite postgres içermeli');
    assert(parsed.services.nextcloud, 'Suite nextcloud içermeli');
    assert(parsed.services.vaultwarden, 'Suite vaultwarden içermeli');
    assert(parsed.services.pulse_sentinel, 'Suite pulse_sentinel içermeli');
    assert(parsed.services.game_cockpit, 'Suite game_cockpit içermeli');
    assert(parsed.services.caddy, 'Suite caddy içermeli');

    // Test IP Address mode for Caddyfile
    const ipSuite = buildSuiteCompose({
      domainOrIp: '192.168.1.100',
      adminEmail: 'admin@test.lan',
      enableNextcloud: true,
      enableVaultwarden: true,
      enablePulse: true,
      enableGameCockpit: true,
      enableCaddy: true,
      targetDir: '/tmp/test-suite-ip',
    });
    assert(isIpAddress('192.168.1.100'), '192.168.1.100 bir IP adresi olarak tanımlanmalı');
    assert(isIpAddress('localhost'), 'localhost bir IP/yerel adres olarak tanımlanmalı');
    assert(!isIpAddress('mycloud.domain.com'), 'mycloud.domain.com domain olarak tanımlanmalı');
    assert(!ipSuite.caddyfile.includes('cloud.192.168.1.100'), 'Caddyfile IP adresine geçersiz subdomain vermemeli');
    assert(ipSuite.caddyfile.includes(':8080'), 'Caddyfile IP modunda :8080 port proxy yapılandırmalı');
  });

  test('XIVIZLEY Nextcloud Unified Hub Compose ve Veritabanı Şeması Üretimi', () => {
    const hubSuite = buildSuiteCompose({
      suiteType: 'unified_hub',
      domainOrIp: '109.104.120.126',
      adminEmail: 'alperen@xivizley.com.tr',
      enableGameCockpit: true,
      enableCaddy: false,
      targetDir: '/tmp/test-unified-hub',
    });

    assert(hubSuite.yamlContent.length > 0, 'Unified Hub YAML üretilmeli');
    assert(hubSuite.envContent.includes('POSTGRES_PASSWORD='), '.env şifre içermeli');
    assert(hubSuite.envContent.includes('COOKIE_SECRET='), '.env cookie secret içermeli');
    assert(hubSuite.envContent.includes('VAULT_MASTER_KEY='), '.env vault master key içermeli');
    assert((hubSuite as any).sqlInitContent.includes('CREATE SCHEMA IF NOT EXISTS sso;'), 'SQL init sso şemasını içermeli');
    assert((hubSuite as any).sqlInitContent.includes('CREATE TABLE IF NOT EXISTS sso.users'), 'SQL init sso.users tablosunu içermeli');
    assert((hubSuite as any).sqlInitContent.includes('CREATE TABLE IF NOT EXISTS pass.vault_items'), 'SQL init pass tablosunu içermeli');
    assert((hubSuite as any).sqlInitContent.includes('CREATE TABLE IF NOT EXISTS drive.files'), 'SQL init drive tablosunu içermeli');

    const parsed = load(hubSuite.yamlContent) as any;
    assert(parsed.services.postgres, 'Unified Hub postgres içermeli');
    assert(parsed.services.hub, 'Unified Hub xivizley-hub içermeli');
    assert(parsed.services['fivem-server'], 'Unified Hub FiveM oyun sunucusu içermeli');
    assert.strictEqual(parsed.services.hub.image, 'deploy-hub:latest', 'Hub imajı deploy-hub:latest olmalı');
    assert(parsed.services.hub.ports.includes('3000:3000'), 'Hub port 3000 açılmalı');
  });

  test('VDS Sistem Teşhis Fonksiyonu ve Port Emniyeti', async () => {
    const health = getSystemHealth();
    assert(health.platform, 'Platform bilgisi alınmalı');
    assert(health.totalRamGB > 0, 'RAM bilgisi alınmalı');
    assert(health.cpuCores > 0, 'CPU çekirdek bilgisi alınmalı');

    // Safe port check for edge values
    const safeInvalidPort = await isPortInUse(-1);
    assert.strictEqual(safeInvalidPort, false, 'Geçersiz negatif port güvenle false dönmeli');
    const safeOverPort = await isPortInUse(999999);
    assert.strictEqual(safeOverPort, false, 'Aralık dışı port güvenle false dönmeli');
  });

  test('CLI Binary Komutları (--version & --help) ve Sembolik Bağlantı Testi', () => {
    const versionOutput = execSync(`node "${cliBin}" --version`).toString().trim();
    assert.strictEqual(versionOutput, '1.0.0', 'Sürüm 1.0.0 olmalı');

    const helpOutput = execSync(`node "${cliBin}" --help`).toString();
    assert(helpOutput.includes('XIVIZLEY Industrial Server'), 'Yardım metni başlık içermeli');
    assert(helpOutput.includes('suite'), 'suite komutu yardımda listelenmeli');
    assert(helpOutput.includes('install'), 'install komutu yardımda listelenmeli');
    assert(helpOutput.includes('doctor'), 'doctor komutu yardımda listelenmeli');
    assert(helpOutput.includes('backup'), 'backup komutu yardımda listelenmeli');
    assert(helpOutput.includes('templates'), 'templates komutu yardımda listelenmeli');
    assert(helpOutput.includes('sync'), 'sync komutu yardımda listelenmeli');

    // Symlink / npx invocation test
    const symlinkPath = path.resolve(__dirname, '../dist/symlink_test_bin');
    try {
      fs.symlinkSync(cliBin, symlinkPath);
      const symlinkOutput = execSync(`"${symlinkPath}" --version`).toString().trim();
      assert.strictEqual(symlinkOutput, '1.0.0', 'Sembolik bağlantı üzerinden çağrıldığında 1.0.0 döndürmeli');
    } finally {
      if (fs.existsSync(symlinkPath)) fs.unlinkSync(symlinkPath);
    }
  });

  test('Arama ve Filtreleme Motoru ve Kategori Kapsamı', () => {
    const jellyfinSearch = searchModules('jellyfin');
    assert(jellyfinSearch.some((m) => m.id === 'jellyfin'), 'Jellyfin araması Jellyfin getirmeli');

    const mediaModules = getModulesByCategory('media');
    assert(mediaModules.length >= 8, 'Medya kategorisinde en az 8 app olmalı');

    const aiTemplate = getTemplate('local-ai-ollama');
    assert(aiTemplate, 'Local AI Ollama şablonu bulunmalı');

    // Verify all categories exist in getCategories (including proxy and tunnel)
    const categories = getCategories();
    assert(categories.some((c) => c.id === 'proxy'), 'Reverse Proxy kategorisi bulunmalı');
    assert(categories.some((c) => c.id === 'tunnel'), 'Tünel kategorisi bulunmalı');
    assert(categories.length >= 9, `En az 9 kategori olmalı, bulunan: ${categories.length}`);
  });

  test('CLI Doğrudan Kurulum Komutları (dockge, beszel, prowlarr) ve Docker Compose Üretimi', () => {
    const tmpBase = path.resolve(__dirname, '../dist/tmp_cli_test_' + Date.now());
    fs.mkdirSync(tmpBase, { recursive: true });

    try {
      // 1. Dockge
      const dockgeDir = path.join(tmpBase, 'dockge');
      execSync(`node "${cliBin}" install dockge -y --dir "${dockgeDir}" --no-start`);
      const dockgeComposePath = path.join(dockgeDir, 'docker-compose.yml');
      assert(fs.existsSync(dockgeComposePath), 'Dockge docker-compose.yml üretilmeli');
      const dockgeYaml = fs.readFileSync(dockgeComposePath, 'utf8');
      const parsedDockge = load(dockgeYaml) as any;
      assert(parsedDockge.services.dockge, 'Dockge servisi compose içinde tanımlı olmalı');
      assert(parsedDockge.services.dockge.ports.includes('5001:5001'), 'Dockge varsayılan port 5001:5001 atanmalı');

      // 2. Beszel
      const beszelDir = path.join(tmpBase, 'beszel');
      execSync(`node "${cliBin}" install beszel -y --dir "${beszelDir}" --no-start`);
      const beszelComposePath = path.join(beszelDir, 'docker-compose.yml');
      assert(fs.existsSync(beszelComposePath), 'Beszel docker-compose.yml üretilmeli');
      const beszelYaml = fs.readFileSync(beszelComposePath, 'utf8');
      const parsedBeszel = load(beszelYaml) as any;
      assert(parsedBeszel.services.beszel, 'Beszel servisi compose içinde tanımlı olmalı');
      assert(parsedBeszel.services.beszel.ports.includes('8090:8090'), 'Beszel varsayılan port 8090:8090 atanmalı');

      // 3. Prowlarr
      const prowlarrDir = path.join(tmpBase, 'prowlarr');
      execSync(`node "${cliBin}" install prowlarr -y --dir "${prowlarrDir}" --no-start`);
      const prowlarrComposePath = path.join(prowlarrDir, 'docker-compose.yml');
      assert(fs.existsSync(prowlarrComposePath), 'Prowlarr docker-compose.yml üretilmeli');
      const prowlarrYaml = fs.readFileSync(prowlarrComposePath, 'utf8');
      const parsedProwlarr = load(prowlarrYaml) as any;
      assert(parsedProwlarr.services.prowlarr, 'Prowlarr servisi compose içinde tanımlı olmalı');
      assert(parsedProwlarr.services.prowlarr.ports.includes('9696:9696'), 'Prowlarr varsayılan port 9696:9696 atanmalı');
    } finally {
      if (fs.existsSync(tmpBase)) {
        fs.rmSync(tmpBase, { recursive: true, force: true });
      }
    }
  });

  test('Yeni Modüller için Port Çakışma ve Alternatif Port Tahsisi (PORT_ALTERNATIVES)', () => {
    const dockge = getModule('dockge');
    const beszel = getModule('beszel');
    const prowlarr = getModule('prowlarr');
    assert(dockge && beszel && prowlarr, 'Dockge, Beszel ve Prowlarr modülleri katalogda bulunmalı');

    // Simulate already allocated ports on the host
    const allocated = new Set<number>([5001, 8090, 9696]);
    const res = resolvePortConflicts([dockge, beszel, prowlarr], allocated);

    assert.strictEqual(res.conflictsDetected, true, 'Port çakışması tespit edilmeli');
    assert.strictEqual(res.resolvedMappings.get('dockge:5001')?.host, 5011, 'Dockge çakışmasında 5011 alternatif portu atanmalı');
    assert.strictEqual(res.resolvedMappings.get('beszel:8090')?.host, 8190, 'Beszel çakışmasında 8190 alternatif portu atanmalı');
    assert.strictEqual(res.resolvedMappings.get('prowlarr:9696')?.host, 9697, 'Prowlarr çakışmasında 9697 alternatif portu atanmalı');
  });

  test('Yeni 2026 Endüstriyel Şablonların Docker Compose İçeriği (ultimate-arr-media & lightweight-homelab-ops)', () => {
    const arrTemplate = getTemplate('ultimate-arr-media');
    assert(arrTemplate, 'ultimate-arr-media şablonu bulunmalı');
    const parsedArr = load(arrTemplate.composeSnippet) as any;
    assert(parsedArr.services.jellyfin, 'Jellyfin servisi içermeli');
    assert(parsedArr.services.prowlarr, 'Prowlarr servisi içermeli');
    assert(parsedArr.services.bazarr, 'Bazarr servisi içermeli');
    assert(parsedArr.services.gluetun, 'Gluetun VPN servisi içermeli');

    const opsTemplate = getTemplate('lightweight-homelab-ops');
    assert(opsTemplate, 'lightweight-homelab-ops şablonu bulunmalı');
    const parsedOps = load(opsTemplate.composeSnippet) as any;
    assert(parsedOps.services.dockge, 'Dockge servisi içermeli');
    assert(parsedOps.services.beszel, 'Beszel servisi içermeli');
    assert(parsedOps.services.homarr, 'Homarr servisi içermeli');
  });
});
