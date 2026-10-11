import { MODULE_CATALOG, type ModuleDefinition, type ModuleCategory, CATEGORY_LABELS, getAllCategories } from '../data/modules.js';

export function getAllModules(): ModuleDefinition[] {
  return MODULE_CATALOG.filter((m) => !m.isOS && !m.isHostInstall);
}

export function getModule(id: string): ModuleDefinition | undefined {
  const normalized = id.toLowerCase().trim();
  return MODULE_CATALOG.find((m) => m.id.toLowerCase() === normalized || m.name.toLowerCase() === normalized);
}

export function searchModules(query: string): ModuleDefinition[] {
  const q = query.toLowerCase().trim();
  if (!q) return getAllModules();

  return getAllModules().filter((m) => {
    return (
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      m.dockerImage.toLowerCase().includes(q)
    );
  });
}

export function getModulesByCategory(category: ModuleCategory): ModuleDefinition[] {
  return getAllModules().filter((m) => m.category === category);
}

export function getCategories(): Array<{ id: ModuleCategory; label: string; count: number }> {
  const all = getAllModules();
  const cats = getAllCategories().filter((c) => c !== 'os');

  return cats
    .map((cat) => ({
      id: cat,
      label: CATEGORY_LABELS[cat] || cat,
      count: all.filter((m) => m.category === cat).length,
    }))
    .filter((c) => c.count > 0);
}
