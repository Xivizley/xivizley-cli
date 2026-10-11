import { dump } from 'js-yaml';
import type { ModuleDefinition } from '../data/modules.js';
import { PORT_ALTERNATIVES } from '../data/modules.js';

export interface ComposeService {
  image: string;
  container_name?: string;
  restart?: string;
  ports?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  networks?: string[];
  depends_on?: string[];
  command?: string | string[];
  cap_add?: string[];
}

export interface DockerComposeConfig {
  version?: string;
  services: Record<string, ComposeService>;
  networks?: Record<string, { driver?: string }>;
  volumes?: Record<string, any>;
}

export interface PortResolutionResult {
  conflictsDetected: boolean;
  resolvedMappings: Map<string, { internal: number; host: number; remapped: boolean }>;
  log: string[];
}

export function resolvePortConflicts(
  modules: ModuleDefinition[],
  allocatedPorts: Set<number> = new Set()
): PortResolutionResult {
  const resolvedMappings = new Map<string, { internal: number; host: number; remapped: boolean }>();
  const log: string[] = [];
  let conflictsDetected = false;

  for (const mod of modules) {
    for (const portDef of mod.ports) {
      const desired = portDef.default;
      const key = `${mod.id}:${portDef.internal}`;

      if (allocatedPorts.has(desired)) {
        conflictsDetected = true;
        if (portDef.locked) {
          log.push(`[PORT RADAR] ⚠️ ${mod.name} (${portDef.label}): ${desired} portu kilitli/sabit (protokol zorunlu). Alternatif port atanamadı.`);
          resolvedMappings.set(key, { internal: portDef.internal, host: desired, remapped: false });
          continue;
        }

        // Search in alternatives or find free port
        const alts = PORT_ALTERNATIVES[desired] || [];
        let chosen: number | null = null;
        for (const alt of alts) {
          if (!allocatedPorts.has(alt)) {
            chosen = alt;
            break;
          }
        }
        if (!chosen) {
          chosen = desired + 10;
          while (allocatedPorts.has(chosen)) {
            chosen++;
          }
        }
        log.push(`[PORT RADAR] ${mod.name} (${portDef.label}): ${desired} portu çakıştı ➔ ${chosen} olarak yeniden yönlendirildi.`);
        allocatedPorts.add(chosen);
        resolvedMappings.set(key, { internal: portDef.internal, host: chosen, remapped: true });
      } else {
        allocatedPorts.add(desired);
        resolvedMappings.set(key, { internal: portDef.internal, host: desired, remapped: false });
      }
    }
  }

  return { conflictsDetected, resolvedMappings, log };
}

export function buildComposeFromModules(
  modules: ModuleDefinition[],
  options: {
    networkName?: string;
    customEnv?: Record<string, Record<string, string>>;
    portOverrides?: Record<string, number>;
  } = {}
): { compose: DockerComposeConfig; yamlString: string; portLog: string[] } {
  const networkName = options.networkName || 'xivizley_network';
  const { resolvedMappings, log } = resolvePortConflicts(modules);

  const services: Record<string, ComposeService> = {};

  for (const mod of modules) {
    if (mod.isOS || mod.isHostInstall) continue;

    const svcKey = mod.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const servicePorts: string[] = [];
    const serviceEnv: Record<string, string> = {};
    const serviceVolumes: string[] = [];

    // Ports
    for (const p of mod.ports) {
      const mappingKey = `${mod.id}:${p.internal}`;
      const resolved = resolvedMappings.get(mappingKey);
      const hostPort = options.portOverrides?.[`${mod.id}:${p.internal}`] ?? resolved?.host ?? p.default;
      const proto = p.protocol === 'udp' ? '/udp' : '';
      servicePorts.push(`${hostPort}:${p.internal}${proto}`);
    }

    // Environment
    for (const env of mod.environment) {
      const customVal = options.customEnv?.[mod.id]?.[env.key];
      serviceEnv[env.key] = customVal !== undefined ? customVal : env.defaultValue;
    }

    // Volumes
    for (const vol of mod.volumes) {
      serviceVolumes.push(`${vol.hostPath}:${vol.containerPath}`);
    }

    services[svcKey] = {
      image: `${mod.dockerImage}:${mod.defaultTag || 'latest'}`,
      container_name: `xivizley_${svcKey}`,
      restart: 'unless-stopped',
      networks: [networkName],
      ...(mod.id === 'gluetun' ? { cap_add: ['NET_ADMIN'] } : {}),
      ...(servicePorts.length > 0 ? { ports: servicePorts } : {}),
      ...(Object.keys(serviceEnv).length > 0 ? { environment: serviceEnv } : {}),
      ...(serviceVolumes.length > 0 ? { volumes: serviceVolumes } : {}),
    };
  }

  const compose: DockerComposeConfig = {
    services,
    networks: {
      [networkName]: { driver: 'bridge' },
    },
  };

  const yamlString = dump(compose, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });

  return { compose, yamlString, portLog: log };
}
