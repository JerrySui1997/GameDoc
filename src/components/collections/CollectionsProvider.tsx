'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Collection } from '@/lib/collections/types';

type CollectionsContextValue = {
  collections: Collection[];
  getById: (id: string) => Collection | undefined;
  createCollection: (collection: Collection) => Promise<Collection>;
  updateCollection: (id: string, collection: Collection) => Promise<Collection>;
  deleteCollection: (id: string) => Promise<void>;
};

const CollectionsContext = createContext<CollectionsContextValue | null>(null);

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error === 'string' ? data.error : JSON.stringify(data?.error ?? data);
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function CollectionsProvider({
  initialCollections,
  children,
}: {
  initialCollections: Collection[];
  children: React.ReactNode;
}) {
  const [collections, setCollections] = useState<Collection[]>(initialCollections);

  const getById = useCallback((id: string) => collections.find((c) => c.id === id), [collections]);

  const createCollection = useCallback<CollectionsContextValue['createCollection']>(async (collection) => {
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collection),
    });
    if (!res.ok) throw new Error(await parseError(res));
    const created: Collection = await res.json();
    setCollections((prev) => [...prev, created]);
    return created;
  }, []);

  const updateCollection = useCallback<CollectionsContextValue['updateCollection']>(async (id, collection) => {
    const res = await fetch(`/api/collections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collection),
    });
    if (!res.ok) throw new Error(await parseError(res));
    const updated: Collection = await res.json();
    setCollections((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  const deleteCollection = useCallback<CollectionsContextValue['deleteCollection']>(async (id) => {
    const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseError(res));
    setCollections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const value = useMemo<CollectionsContextValue>(
    () => ({ collections, getById, createCollection, updateCollection, deleteCollection }),
    [collections, getById, createCollection, updateCollection, deleteCollection],
  );

  return <CollectionsContext.Provider value={value}>{children}</CollectionsContext.Provider>;
}

export function useCollections(): CollectionsContextValue {
  const ctx = useContext(CollectionsContext);
  if (!ctx) throw new Error('useCollections must be used within a CollectionsProvider');
  return ctx;
}
