export const NOTE_KINDS = ["quick", "journal", "knowledge", "pdf"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export const KNOWLEDGE_LEVELS = ["Tree", "Branches", "Leaf", "Flower", "Fruit"] as const;
export type KnowledgeLevel = (typeof KNOWLEDGE_LEVELS)[number];

export interface Note {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  parentId: string | null;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  entryDate?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentData?: Blob;
}

export interface NotePatch {
  title?: string;
  body?: string;
  parentId?: string | null;
  tags?: string[];
  pinned?: boolean;
  archived?: boolean;
}

export function knowledgeDepth(noteId: string, notes: readonly Note[]): number {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const seen = new Set<string>();
  let current = byId.get(noteId);
  let depth = 0;
  while (current?.parentId) {
    if (seen.has(current.id)) return KNOWLEDGE_LEVELS.length;
    seen.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent || parent.kind !== "knowledge") break;
    depth += 1;
    current = parent;
  }
  return depth;
}

export function knowledgeLevel(noteId: string, notes: readonly Note[]): KnowledgeLevel {
  return KNOWLEDGE_LEVELS[Math.min(knowledgeDepth(noteId, notes), KNOWLEDGE_LEVELS.length - 1)];
}

export function canAddKnowledgeChild(parentId: string, notes: readonly Note[]): boolean {
  const parent = notes.find((note) => note.id === parentId);
  return !!parent && parent.kind === "knowledge" && knowledgeDepth(parentId, notes) < KNOWLEDGE_LEVELS.length - 1;
}

export function createNote(kind: NoteKind, parentId: string | null = null): Note {
  const now = new Date().toISOString();
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind,
    title: kind === "journal" ? "Daily note" : kind === "knowledge" ? "New page" : kind === "pdf" ? "Imported PDF" : "Untitled note",
    body: "",
    parentId,
    tags: [],
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
    ...(kind === "journal" ? { entryDate: now.slice(0, 10) } : {})
  };
}
