# XIVIZLEY Interactive CLI Engine (`npx xivizley`)

```
  ██╗  ██╗██╗██╗   ██╗██╗███████╗██╗     ███████╗██╗   ██╗
  ╚██╗██╔╝██║██║   ██║██║╚══███╔╝██║     ██╔════╝╚██╗ ██╔╝
   ╚███╔╝ ██║██║   ██║██║  ███╔╝ ██║     █████╗   ╚████╔╝ 
   ██╔██╗ ██║╚██╗ ██╔╝██║ ███╔╝  ██║     ██╔══╝    ╚██╔╝  
  ██╔╝ ██╗██║ ╚████╔╝ ██║███████╗███████╗███████╗   ██║   
  ╚═╝  ╚═╝╚═╝  ╚═══╝  ╚═╝╚══════╝╚══════╝╚══════╝   ╚═╝   
  >> XIVIZLEY Industrial Engine v1.0.0
  >> Kurucu & Mimar: Alperen Celal (14, Bursa)
```

Node.js ve NPM üzerinden tek komutla çalışan, hem **XIVIZLEY Ekosistemi**'ni hem **31 Komple Şablonu** hem de kütüphanedeki **112+ Bağımsız Uygulamayı (Standalone Apps)** teker teker veya çoklu seçimle kurabilen interaktif terminal arayüzü (TUI).

---

## 🚀 Hızlı Başlangıç

```bash
# İnteraktif TUI Sihirbazı
npx xivizley

# Doğrudan Amiral Gemisi Cloud Suite Kurulumu
npx xivizley suite

# Tekil Uygulama Kurulumu (Örn: Jellyfin, Vaultwarden, Ollama)
npx xivizley install jellyfin

# 112+ Tekil Uygulama Mağazasını Açma
npx xivizley apps

# 31 Endüstriyel Şablon Kataloğunu İnceleme veya Kurma
npx xivizley templates

# Pre-flight Port Çakışma Radarı ve Sunucu Sağlık Taraması
npx xivizley doctor

# Otomatik Felaket Kurtarma ve Yedekleme Betikleri Üreticisi
npx xivizley backup

# Web Sitesinden Mimari Blueprint Senkronizasyonu
npx xivizley sync <blueprint-id>
```

---

## 🌟 Temel Özellikler

1. **👑 XIVIZLEY Cloud Suite**:
   Nextcloud Hub & Drive, Vaultwarden Passwords, Pulse Sentinel, Game Cockpit ve Caddy Reverse Proxy (otomatik HTTPS SSL).

2. **📦 Tekil Uygulama Mağazası (112+ Servis)**:
   Medya, Güvenlik/VPN, Bulut/Ofis, Oyun Sunucuları, DevOps/İzleme, Veritabanları ve Yapay Zeka kategorilerinde 115 adet bağımsız Docker uygulaması. Tek tıkla port özelleştirme ve ortam değişkenleri yönetimi.

3. **☑️ Çoklu Seçim Bestecisi (Multi-Select Composer)**:
   Birden fazla uygulamayı aynı anda seçtiğinizde port çakışmalarını otomatik tespit eder ve alternatif portlara yönlendirerek tek bir `docker-compose.yml` içinde birleştirir.

4. **🌟 31 Endüstriyel Şablon (Full Stacks)**:
   DIN 40719 standartlarında hazırlanmış Yerel LLM, Medya Merkezi, Güvenlik, Oyun Sunucuları ve SaaS altyapıları.

5. **🛡️ VDS Doktoru & Port Çakışma Radarı**:
   Sunucu soketlerini canlı tarayarak hangi portların açık, hangilerinin kullanımda olduğunu raporlar. Docker Engine ve RAM/CPU durumunu ölçer.

6. **💾 Felaket Kurtarma Motoru**:
   Tek komutla sıcak Docker volüm ve veritabanı yedeği alan `backup.sh` ile tek tıkla kurtarma sağlayan `restore.sh` otomasyonları.

---

## 🧪 Testler

```bash
npm test
```

8/8 birim ve entegrasyon testleri ile katalog bütünlüğü, 115 uygulamanın geçerli compose üretimi, port çakışma çözümleyicisi ve CLI argümanları doğrulanmaktadır.

---

## 👨‍💻 Geliştirici ve Lisans

- **Kurucu & Mimar:** Alperen Celal (14, Bursa)
- **Web Platform:** [xivizley.com.tr](https://xivizley.com.tr)
- **Lisans:** MIT
