import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });

  async onModuleInit() {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Start PostgreSQL and configure the API environment first.");
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id uuid PRIMARY KEY,
        kind text NOT NULL CHECK (kind IN ('quick','journal','knowledge','pdf')),
        title text NOT NULL DEFAULT '',
        body text NOT NULL DEFAULT '',
        parent_id uuid REFERENCES notes(id) ON DELETE SET NULL,
        tags text[] NOT NULL DEFAULT '{}',
        pinned boolean NOT NULL DEFAULT false,
        archived boolean NOT NULL DEFAULT false,
        entry_date date,
        attachment_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes (updated_at DESC);
      CREATE INDEX IF NOT EXISTS notes_parent_id_idx ON notes (parent_id);
      CREATE INDEX IF NOT EXISTS notes_kind_idx ON notes (kind);
      CREATE UNIQUE INDEX IF NOT EXISTS notes_journal_date_idx ON notes (entry_date) WHERE kind = 'journal';
    `);
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async onModuleDestroy() { await this.pool.end(); }
}
