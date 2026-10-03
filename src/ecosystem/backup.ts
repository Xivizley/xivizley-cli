import path from 'node:path';
import fs from 'node:fs';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { saveStackFiles } from '../utils/system.js';
import { formatBadge } from '../ui/banner.js';

export async function runDisasterRecoveryGenerator(): Promise<void> {
  p.intro(formatBadge('💾 XIVIZLEY FELAKET KURTARMA & YEDEKLEME MOTORU', 'violet'));

  const projectDirInput = await p.text({
    message: 'Yedeklenecek Docker Proje Dizini:',
    initialValue: '.',
  });

  if (p.isCancel(projectDirInput)) return;

  const projectDir = path.resolve(process.cwd(), projectDirInput);

  const backupDirInput = await p.text({
    message: 'Yedeklerin Saklanacağı Arşiv Dizini:',
    initialValue: './xivizley-backups',
  });

  if (p.isCancel(backupDirInput)) return;

  const backupDir = path.resolve(process.cwd(), backupDirInput);

  const retentionDays = await p.text({
    message: 'Eski Yedekleri Saklama Süresi (Gün):',
    initialValue: '7',
    validate: (val) => {
      const n = Number(val);
      if (isNaN(n) || n < 1) return 'Geçerli bir gün sayısı girin.';
    },
  });

  if (p.isCancel(retentionDays)) return;

  const s = p.spinner();
  s.start('backup.sh ve restore.sh felaket kurtarma otomasyonları oluşturuluyor...');

  const backupScript = `#!/usr/bin/env bash
# ============================================================
# XIVIZLEY Disaster Recovery Engine - Automated Backup Script
# Kurucu & Mimar: Alperen Celal (14, Bursa)
# ============================================================
set -euo pipefail

PROJECT_DIR="${projectDir}"
BACKUP_DIR="${backupDir}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ARCHIVE_NAME="xivizley_backup_\${TIMESTAMP}.tar.gz"
TEMP_DIR="/tmp/xivizley_backup_\${TIMESTAMP}"

mkdir -p "\${BACKUP_DIR}"
mkdir -p "\${TEMP_DIR}"

echo "📦 [1/5] Proje konfigürasyonları kopyalanıyor..."
if [ -f "\${PROJECT_DIR}/docker-compose.yml" ]; then
  cp "\${PROJECT_DIR}/docker-compose.yml" "\${TEMP_DIR}/"
fi
if [ -f "\${PROJECT_DIR}/.env" ]; then
  cp "\${PROJECT_DIR}/.env" "\${TEMP_DIR}/"
fi
if [ -f "\${PROJECT_DIR}/Caddyfile" ]; then
  cp "\${PROJECT_DIR}/Caddyfile" "\${TEMP_DIR}/"
fi

echo "🗄️ [2/5] Veritabanı dökümleri alınıyor (varsa)..."
# PostgreSQL dump
if docker ps --format '{{.Names}}' | grep -q 'postgres'; then
  PG_CONTAINER=$(docker ps --format '{{.Names}}' | grep 'postgres' | head -n 1)
  echo "   -> Postgres (\${PG_CONTAINER}) yedekleniyor..."
  docker exec "\${PG_CONTAINER}" pg_dumpall -U xivizley > "\${TEMP_DIR}/postgres_dump.sql" 2>/dev/null || \
  docker exec "\${PG_CONTAINER}" pg_dumpall -U postgres > "\${TEMP_DIR}/postgres_dump.sql" 2>/dev/null || true
fi

# MySQL / MariaDB dump
if docker ps --format '{{.Names}}' | grep -E -q '(mysql|mariadb)'; then
  DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '(mysql|mariadb)' | head -n 1)
  echo "   -> MySQL/MariaDB (\${DB_CONTAINER}) yedekleniyor..."
  docker exec "\${DB_CONTAINER}" mysqldump --all-databases -u root -p"\${MYSQL_ROOT_PASSWORD:-root}" > "\${TEMP_DIR}/mysql_dump.sql" 2>/dev/null || true
fi

echo "📁 [3/5] Volümler ve veri dizinleri arşivleniyor..."
if [ -d "\${PROJECT_DIR}/data" ]; then
  tar -czf "\${TEMP_DIR}/volumes_data.tar.gz" -C "\${PROJECT_DIR}" data 2>/dev/null || true
fi

echo "🗜️ [4/5] Ana arşiv paketi sıkıştırılıyor..."
tar -czf "\${BACKUP_DIR}/\${ARCHIVE_NAME}" -C "\${TEMP_DIR}" .
rm -rf "\${TEMP_DIR}"

echo "🧹 [5/5] ${retentionDays} günden eski yedekler temizleniyor..."
find "\${BACKUP_DIR}" -name "xivizley_backup_*.tar.gz" -type f -mtime +${retentionDays} -delete

echo "✅ Felaket kurtarma yedeği başarıyla tamamlandı!"
echo "   Arşiv: \${BACKUP_DIR}/\${ARCHIVE_NAME}"
`;

  const restoreScript = `#!/usr/bin/env bash
# ============================================================
# XIVIZLEY Disaster Recovery Engine - Automated Restore Script
# Kurucu & Mimar: Alperen Celal (14, Bursa)
# ============================================================
set -euo pipefail

PROJECT_DIR="${projectDir}"
BACKUP_DIR="${backupDir}"

if [ -z "\${1:-}" ]; then
  echo "❌ Kullanım: ./restore.sh <yedek_dosyasi.tar.gz>"
  echo "Mevcut yedekler:"
  ls -lh "\${BACKUP_DIR}"/xivizley_backup_*.tar.gz 2>/dev/null || echo "Yedek bulunamadı."
  exit 1
fi

ARCHIVE_PATH="$1"
if [ ! -f "\${ARCHIVE_PATH}" ]; then
  if [ -f "\${BACKUP_DIR}/\${ARCHIVE_PATH}" ]; then
    ARCHIVE_PATH="\${BACKUP_DIR}/\${ARCHIVE_PATH}"
  else
    echo "❌ Hata: Belirtilen yedek dosyası bulunamadı: \${ARCHIVE_PATH}"
    exit 1
  fi
fi

TEMP_RESTORE_DIR="/tmp/xivizley_restore_\$(date +%s)"
mkdir -p "\${TEMP_RESTORE_DIR}"
tar -xzf "\${ARCHIVE_PATH}" -C "\${TEMP_RESTORE_DIR}"

echo "🛑 Konteynerler durduruluyor..."
if [ -f "\${PROJECT_DIR}/docker-compose.yml" ]; then
  (cd "\${PROJECT_DIR}" && docker compose down) || true
fi

echo "📂 Konfigürasyonlar geri yükleniyor..."
cp -f "\${TEMP_RESTORE_DIR}/docker-compose.yml" "\${PROJECT_DIR}/" 2>/dev/null || true
cp -f "\${TEMP_RESTORE_DIR}/.env" "\${PROJECT_DIR}/" 2>/dev/null || true
if [ -f "\${TEMP_RESTORE_DIR}/Caddyfile" ]; then
  cp -f "\${TEMP_RESTORE_DIR}/Caddyfile" "\${PROJECT_DIR}/" || true
fi

echo "📁 Veri volümleri geri yükleniyor..."
if [ -f "\${TEMP_RESTORE_DIR}/volumes_data.tar.gz" ]; then
  tar -xzf "\${TEMP_RESTORE_DIR}/volumes_data.tar.gz" -C "\${PROJECT_DIR}/"
fi

echo "🚀 Konteynerler yeniden başlatılıyor..."
(cd "\${PROJECT_DIR}" && docker compose up -d)

# Database restore if dump exists
sleep 5
if [ -f "\${TEMP_RESTORE_DIR}/postgres_dump.sql" ]; then
  PG_CONTAINER=$(docker ps --format '{{.Names}}' | grep 'postgres' | head -n 1 || true)
  if [ -n "\${PG_CONTAINER}" ]; then
    echo "🗄️ PostgreSQL veritabanı geri yükleniyor..."
    docker exec -i "\${PG_CONTAINER}" psql -U xivizley < "\${TEMP_RESTORE_DIR}/postgres_dump.sql" 2>/dev/null || \
    docker exec -i "\${PG_CONTAINER}" psql -U postgres < "\${TEMP_RESTORE_DIR}/postgres_dump.sql" 2>/dev/null || true
  fi
fi

rm -rf "\${TEMP_RESTORE_DIR}"
echo "✅ Felaket kurtarma işlemi başarıyla tamamlandı!"
`;

  saveStackFiles(projectDir, [
    { filename: 'backup.sh', content: backupScript },
    { filename: 'restore.sh', content: restoreScript },
  ]);

  try {
    fs.chmodSync(path.join(projectDir, 'backup.sh'), 0o755);
    fs.chmodSync(path.join(projectDir, 'restore.sh'), 0o755);
  } catch {}

  s.stop('Felaket kurtarma betikleri başarıyla üretildi.');

  p.note(
    `📂 Konum: ${pc.cyan(projectDir)}\n` +
    `💾 backup.sh   ➔ Tek komutla sıcak yedekleme alır\n` +
    `🔄 restore.sh  ➔ Tek komutla felaketten geri yükler\n` +
    `⏰ Cron Otomasyonu: Her gece 03:00'te otomatik yedek almak için:\n` +
    `   ${pc.yellow(`0 3 * * * ${path.join(projectDir, 'backup.sh')} >> /var/log/xivizley_backup.log 2>&1`)}`,
    'Kurtarma Betikleri Hazır'
  );

  p.outro(pc.bold(pc.magenta('💾 XIVIZLEY Felaket Kurtarma Motoru Başarıyla Kuruldu!')));
}
