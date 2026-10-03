import { test, describe } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';


import { MODULE_CATALOG } from '../dist/data/modules.js';
import { STACK_TEMPLATES } from '../dist/data/templates.js';
import { getAllModules, getModule, searchModules, getModulesByCategory } from '../dist/apps/catalog.js';
import { getAllTemplates, getTemplate } from '../dist/templates/catalog.js';
import { buildComposeFromModules, resolvePortConflicts } from '../dist/utils/compose.js';
import { buildSuiteCompose } from '../dist/ecosystem/suite.js';
import { getSystemHealth } from '../dist/utils/system.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliBin = path.resolve(__dirname, '../bin/xivizley.mjs');

describe('XIVIZLEY Interactive CLI Engine Tests', () => {

  test('Module Catalog Integrity (112+ Apps)', () => {
    assert(MODULE_CATALOG.length >= 112, `Beklenen en az 112 modül, bulunan: ${MODULE_CATALOG.length}`);
    const nonOsModules = getAllModules();
    assert(nonOsModules.length >= 110, `Bağımsız tekil app sayısı >= 110 olmalı, bulunan: ${nonOsModules.length}`);

    // Verify all standalone container modules have required properties
    for (const mod of nonOsModules) {
      assert(mod.id, 'Modül id içermeli');
      assert(mod.name, `Modül ${mod.id} isim içermeli`);
      assert(mod.category, `Modül ${mod.id} kategori içermeli`);
      assert(mod.dockerImage, `Modül ${mod.id} dockerImage içermeli`);
      assert(Array.isArray(mod.ports), `Modül ${mod.id} ports dizisi içermeli`);
      assert(Array.isArray(mod.environment), `Modül ${mod.id} environment dizisi içermeli`);
    }
  });

  test('31 Endüstriyel Şablon Kataloğu Doğrulaması', () => {
    assert.strictEqual(STACK_TEMPLATES.length, 31, 'Tam olarak 31 endüstriyel şablon bulunmalı');
    
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
    assert(suite.caddyfile.includes('cloud.test.lan'), 'Caddyfile alan adını içermeli');
    assert(suite.envContent.includes('POSTGRES_PASSWORD='), '.env şifre içermeli');
    assert(suite.startScript.includes('docker compose up -d'), 'start.sh başlatma komutu içermeli');

    const parsed = load(suite.yamlContent) as any;
    assert(parsed.services.postgres, 'Suite postgres içermeli');
    assert(parsed.services.nextcloud, 'Suite nextcloud içermeli');
    assert(parsed.services.vaultwarden, 'Suite vaultwarden içermeli');
    assert(parsed.services.pulse_sentinel, 'Suite pulse_sentinel içermeli');
    assert(parsed.services.game_cockpit, 'Suite game_cockpit içermeli');
    assert(parsed.services.caddy, 'Suite caddy içermeli');
  });

  test('VDS Sistem Teşhis Fonksiyonu', () => {
    const health = getSystemHealth();
    assert(health.platform, 'Platform bilgisi alınmalı');
    assert(health.totalRamGB > 0, 'RAM bilgisi alınmalı');
    assert(health.cpuCores > 0, 'CPU çekirdek bilgisi alınmalı');
  });

  test('CLI Binary Komutları (--version & --help)', () => {
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
  });

  test('Arama ve Filtreleme Motoru', () => {
    const jellyfinSearch = searchModules('jellyfin');
    assert(jellyfinSearch.some((m) => m.id === 'jellyfin'), 'Jellyfin araması Jellyfin getirmeli');

    const mediaModules = getModulesByCategory('media');
    assert(mediaModules.length >= 8, 'Medya kategorisinde en az 8 app olmalı');

    const aiTemplate = getTemplate('local-ai-ollama');
    assert(aiTemplate, 'Local AI Ollama şablonu bulunmalı');
  });
});
