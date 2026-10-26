export const NOTE_KINDS = ["quick", "journal", "knowledge", "pdf"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

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
