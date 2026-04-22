import db from '../connection';
import { ResearchSnippet } from '../../shared/types';

export const SnippetRepository = {
  findAll: (): ResearchSnippet[] => {
    return db.prepare('SELECT * FROM research_snippets ORDER BY created_at DESC').all() as ResearchSnippet[];
  },
  
  create: (snippet: any) => {
    const stmt = db.prepare(`
      INSERT INTO research_snippets (id, title, content, tags, source_url, verification_state)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      snippet.id, 
      snippet.title, 
      snippet.content, 
      JSON.stringify(snippet.tags || []), 
      snippet.source_url || null,
      'unverified'
    );
  },

  update: (id: string, updates: Partial<ResearchSnippet>) => {
    const keys = Object.keys(updates).filter(k => k !== 'id');
    if (keys.length === 0) return;
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => (updates as any)[k]);
    db.prepare(`UPDATE research_snippets SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...values, id);
  },

  delete: (id: string) => {
    return db.prepare('DELETE FROM research_snippets WHERE id = ?').run(id);
  }
};
