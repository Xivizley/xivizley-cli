import { STACK_TEMPLATES, TEMPLATE_CATEGORIES, type StackTemplate, type TemplateCategory } from '../data/templates.js';

export function getAllTemplates(): StackTemplate[] {
  return STACK_TEMPLATES;
}

export function getTemplate(id: string): StackTemplate | undefined {
  const norm = id.toLowerCase().trim();
  return STACK_TEMPLATES.find((t) => t.id.toLowerCase() === norm || t.title.toLowerCase().includes(norm));
}

export function getTemplatesByCategory(category: TemplateCategory): StackTemplate[] {
  if (category === 'all') return STACK_TEMPLATES;
  return STACK_TEMPLATES.filter((t) => t.category === category);
}

export function searchTemplates(query: string): StackTemplate[] {
  const q = query.toLowerCase().trim();
  if (!q) return STACK_TEMPLATES;

  return STACK_TEMPLATES.filter((t) => {
    return (
      t.id.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.subtitle.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });
}
