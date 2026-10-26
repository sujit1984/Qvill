import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NoteKind } from "@qvill/shared";
import { DatabaseService } from "../database/database.service";

const kinds = new Set<NoteKind>(["quick", "journal", "knowledge", "pdf"]);
type NoteRow = Record<string, any> & { id: string; kind: NoteKind; title: string; body: string; parent_id: string | null; tags: string[]; pinned: boolean; archived: boolean; entry_date: string | null; attachment_name: string | null; created_at: Date; updated_at: Date };
type KnowledgeRow = Record<string, any> & { id: string; parent_id: string | null; kind: NoteKind };
const present = (row: NoteRow) => ({
  id: row.id, kind: row.kind, title: row.title, body: row.body, parentId: row.parent_id,
  tags: row.tags, pinned: row.pinned, archived: row.archived,
  ...(row.entry_date ? { entryDate: String(row.entry_date).slice(0, 10) } : {}),
  ...(row.attachment_name ? { attachmentName: row.attachment_name } : {}),
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString()
});

@Injectable()
export class NotesService {
  constructor(private readonly db: DatabaseService) {}

  private async validateParent(parentId: string | null, childId?: string) {
    const result = await this.db.query<KnowledgeRow>("SELECT id, parent_id, kind FROM notes WHERE kind = 'knowledge'");
    const byId = new Map(result.rows.map((row) => [row.id, row]));
    const child = childId ? byId.get(childId) : undefined;
    if (childId && !child) throw new BadRequestException("Only knowledge pages can have child pages");
    if (parentId && !byId.has(parentId)) throw new BadRequestException("A knowledge page can only be nested under another knowledge page");

    const path = new Set<string>();
    const depthOf = (id: string): number => {
      if (path.has(id)) throw new BadRequestException("The knowledge tree contains a cycle");
      path.add(id);
      const row = byId.get(id);
      const depth = row?.parent_id && byId.has(row.parent_id) ? depthOf(row.parent_id) + 1 : 0;
      path.delete(id);
      return depth;
    };
    const descendants = new Set<string>();
    const heightOf = (id: string): number => {
      if (descendants.has(id)) throw new BadRequestException("The knowledge tree contains a cycle");
      descendants.add(id);
      const children = result.rows.filter((row) => row.parent_id === id);
      const height = children.reduce((max, row) => Math.max(max, heightOf(row.id) + 1), 1);
      descendants.delete(id);
      return height;
    };

    if (parentId && childId) {
      const childDescendants = new Set<string>();
      const collect = (id: string) => {
        if (childDescendants.has(id)) return;
        childDescendants.add(id);
        result.rows.filter((row) => row.parent_id === id).forEach((row) => collect(row.id));
      };
      collect(childId);
      if (childDescendants.has(parentId)) throw new BadRequestException("A page cannot be moved under its own descendant");
    }

    const parentDepth = parentId ? depthOf(parentId) : -1;
    const subtreeHeight = childId ? heightOf(childId) : 1;
    if (parentDepth + subtreeHeight > 4) {
      throw new BadRequestException("The knowledge tree is limited to Root → Trunk → Branch → Twig → Leaf. Leaf pages cannot have children.");
    }
  }

  async list(kind?: string) {
    if (kind && !kinds.has(kind as NoteKind)) throw new BadRequestException("Unknown note kind");
    const result = await this.db.query<NoteRow>(kind
      ? "SELECT * FROM notes WHERE kind = $1 ORDER BY updated_at DESC"
      : "SELECT * FROM notes ORDER BY updated_at DESC", kind ? [kind] : []);
    return result.rows.map(present);
  }

  async create(input: Record<string, unknown>) {
    const kind = (input.kind ?? "quick") as NoteKind;
    if (!kinds.has(kind)) throw new BadRequestException("Unknown note kind");
    const id = randomUUID();
    const title = typeof input.title === "string" ? input.title : kind === "journal" ? "Daily note" : kind === "knowledge" ? "New page" : "Untitled note";
    const body = typeof input.body === "string" ? input.body : "";
    const parentId = typeof input.parentId === "string" ? input.parentId : null;
    if (kind !== "knowledge" && parentId) throw new BadRequestException("Only knowledge pages can be nested");
    if (kind === "knowledge" && parentId) await this.validateParent(parentId);
    const entryDate = kind === "journal" ? String(input.entryDate ?? new Date().toISOString().slice(0, 10)) : null;
    const tags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 30) : [];
    const result = await this.db.query<NoteRow>(`INSERT INTO notes (id, kind, title, body, parent_id, tags, entry_date, attachment_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [id, kind, title, body, parentId, tags, entryDate, typeof input.attachmentName === "string" ? input.attachmentName : null]);
    return present(result.rows[0]);
  }

  async update(id: string, input: Record<string, unknown>) {
    const columns: Record<string, string> = { title: "title", body: "body", parentId: "parent_id", tags: "tags", pinned: "pinned", archived: "archived" };
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(columns)) {
      if (!(key in input)) continue;
      const value = input[key];
      if (key === "title" || key === "body") {
        if (typeof value !== "string") throw new BadRequestException(`${key} must be text`);
      } else if (key === "parentId") {
        if (value !== null && typeof value !== "string") throw new BadRequestException("parentId must be a note ID or null");
      } else if (key === "tags") {
        if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new BadRequestException("tags must be a list of text");
      } else if (typeof value !== "boolean") throw new BadRequestException(`${key} must be boolean`);
      values.push(value); updates.push(`${column} = $${values.length}`);
    }
    if (!updates.length) throw new BadRequestException("No supported note fields provided");
    if ("parentId" in input) {
      const current = await this.db.query<Record<string, any> & { kind: NoteKind }>("SELECT kind FROM notes WHERE id = $1", [id]);
      if (!current.rows[0]) throw new NotFoundException("Note not found");
      const parentId = input.parentId as string | null;
      if (current.rows[0].kind === "knowledge") await this.validateParent(parentId, id);
      else if (parentId !== null) throw new BadRequestException("Only knowledge pages can be nested");
    }
    values.push(id);
    const result = await this.db.query<NoteRow>(`UPDATE notes SET ${updates.join(", ")}, updated_at = now() WHERE id = $${values.length} RETURNING *`, values);
    if (!result.rows[0]) throw new NotFoundException("Note not found");
    return present(result.rows[0]);
  }

  async delete(id: string) {
    const result = await this.db.query("DELETE FROM notes WHERE id = $1 RETURNING id", [id]);
    if (!result.rowCount) throw new NotFoundException("Note not found");
    return { id, deleted: true };
  }
}
