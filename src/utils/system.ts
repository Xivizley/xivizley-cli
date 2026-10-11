import net from 'node:net';
import os from 'node:os';
import { exec, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface PortCheckResult {
  port: number;
  inUse: boolean;
  service?: string;
}

export function isPortInUse(port: number, host = '127.0.0.1', timeoutMs = 400): Promise<boolean> {
  if (isNaN(port) || port < 1 || port > 65535) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    try {
      socket.connect(port, host);
    } catch {
      socket.destroy();
      resolve(false);
    }
  });
}

export async function scanPorts(ports: number[]): Promise<PortCheckResult[]> {
  const results: PortCheckResult[] = [];
  for (const port of ports) {
    const inUse = await isPortInUse(port);
    results.push({ port, inUse });
  }
  return results;
}

export interface SystemHealth {
  platform: string;
  release: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalRamGB: number;
  freeRamGB: number;
  usedRamGB: number;
  dockerInstalled: boolean;
  dockerRunning: boolean;
  dockerVersion?: string;
}

export function getSystemHealth(): SystemHealth {
  const totalRamBytes = os.totalmem();
  const freeRamBytes = os.freemem();
  const totalRamGB = Number((totalRamBytes / (1024 ** 3)).toFixed(1));
  const freeRamGB = Number((freeRamBytes / (1024 ** 3)).toFixed(1));
  const usedRamGB = Number(((totalRamBytes - freeRamBytes) / (1024 ** 3)).toFixed(1));

  let dockerInstalled = false;
  let dockerRunning = false;
  let dockerVersion: string | undefined = undefined;

  try {
    const v = execSync('docker --version', { stdio: ['pipe', 'pipe', 'ignore'], timeout: 2000 }).toString().trim();
    dockerInstalled = true;
    dockerVersion = v;
  } catch {
    dockerInstalled = false;
  }

  if (dockerInstalled) {
    try {
      execSync('docker info', { stdio: ['pipe', 'pipe', 'ignore'], timeout: 2500 });
      dockerRunning = true;
    } catch {
      dockerRunning = false;
    }
  }

  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown CPU';
  const cpuCores = cpus.length;

  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuModel,
    cpuCores,
    totalRamGB,
    freeRamGB,
    usedRamGB,
    dockerInstalled,
    dockerRunning,
    dockerVersion,
  };
}

export function saveStackFiles(
  targetDir: string,
  files: { filename: string; content: string }[]
): string[] {
  fs.mkdirSync(targetDir, { recursive: true });
  const created: string[] = [];

  for (const f of files) {
    const filePath = path.join(targetDir, f.filename);
    fs.writeFileSync(filePath, f.content, 'utf8');
    created.push(filePath);
  }

  return created;
}

export function executeDockerCompose(targetDir: string, flags = 'up -d'): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const health = getSystemHealth();
    if (!health.dockerInstalled) {
      resolve({ success: false, output: 'Docker sistemde kurulu değil veya PATH üzerinde bulunamadı. Lütfen Docker engine kurun.' });
      return;
    }
    if (!health.dockerRunning) {
      resolve({ success: false, output: 'Docker servisi/daemon aktif değil veya çalışmıyor. Lütfen Docker engine başlatın.' });
      return;
    }

    exec(`docker compose ${flags}`, { cwd: targetDir }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, output: stderr || stdout || error.message });
      } else {
        resolve({ success: true, output: stdout || 'Konteynerler başarıyla başlatıldı.' });
      }
    });
  });
}
