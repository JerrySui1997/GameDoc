'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PageTemplate } from '@/lib/templates/types';

type TemplatesContextValue = {
  templates: PageTemplate[];
  getById: (id: string) => PageTemplate | undefined;
  createTemplate: (template: PageTemplate) => Promise<PageTemplate>;
  updateTemplate: (id: string, template: PageTemplate) => Promise<PageTemplate>;
  deleteTemplate: (id: string) => Promise<void>;
};

const TemplatesContext = createContext<TemplatesContextValue | null>(null);

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error === 'string' ? data.error : JSON.stringify(data?.error ?? data);
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function TemplatesProvider({
  initialTemplates,
  children,
}: {
  initialTemplates: PageTemplate[];
  children: React.ReactNode;
}) {
  const [templates, setTemplates] = useState<PageTemplate[]>(initialTemplates);

  const getById = useCallback((id: string) => templates.find((t) => t.id === id), [templates]);

  const createTemplate = useCallback<TemplatesContextValue['createTemplate']>(async (template) => {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    if (!res.ok) throw new Error(await parseError(res));
    const created: PageTemplate = await res.json();
    setTemplates((prev) => [...prev, created]);
    return created;
  }, []);

  const updateTemplate = useCallback<TemplatesContextValue['updateTemplate']>(async (id, template) => {
    const res = await fetch(`/api/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    if (!res.ok) throw new Error(await parseError(res));
    const updated: PageTemplate = await res.json();
    setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)));
    return updated;
  }, []);

  const deleteTemplate = useCallback<TemplatesContextValue['deleteTemplate']>(async (id) => {
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseError(res));
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<TemplatesContextValue>(
    () => ({ templates, getById, createTemplate, updateTemplate, deleteTemplate }),
    [templates, getById, createTemplate, updateTemplate, deleteTemplate],
  );

  return <TemplatesContext.Provider value={value}>{children}</TemplatesContext.Provider>;
}

export function useTemplates(): TemplatesContextValue {
  const ctx = useContext(TemplatesContext);
  if (!ctx) throw new Error('useTemplates must be used within a TemplatesProvider');
  return ctx;
}
