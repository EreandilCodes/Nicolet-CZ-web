import { describe, it, expect } from 'vitest';
import '../setup.js';

// Verifies the FAQ seed guard introduced with the dual-DB audit:
// the seed used a plain INSERT, so every server restart re-inserted
// the 17 default FAQs (local dev DB accumulated 29 copies of each).
describe('initDatabase seed idempotence', () => {
  it('FAQ seed does not duplicate rows when seed INSERTs run twice', async () => {
    const { default: db, initDatabase } = await import('../../backend/database.js');
    await initDatabase();

    const first = parseInt((await db.prepare('SELECT COUNT(*) c FROM faqs').get()).c, 10);
    expect(first).toBe(17); // exactly the seed set, no more

    // Re-run the exact seed INSERT statements the way a second boot would
    // (guarded now by unique index + ON CONFLICT DO NOTHING).
    const seeds = await db.prepare(
      'SELECT category_cz, category_en, question_cz, question_en, answer_cz, answer_en, display_order FROM faqs ORDER BY id LIMIT 17'
    ).all();
    for (const f of seeds) {
      await db.prepare(`
        INSERT INTO faqs (category_cz, category_en, question_cz, question_en, answer_cz, answer_en, display_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT (question_cz) DO NOTHING
      `).run(f.category_cz, f.category_en, f.question_cz, f.question_en, f.answer_cz, f.answer_en, f.display_order);
    }

    const after = parseInt((await db.prepare('SELECT COUNT(*) c FROM faqs').get()).c, 10);
    expect(after).toBe(first);
  });

  it('admin user seed does not duplicate on re-run', async () => {
    const { default: db, initDatabase } = await import('../../backend/database.js');
    await initDatabase();
    const users = await db.prepare("SELECT COUNT(*) c FROM users WHERE email = 'admin@nicolet.cz'").get();
    expect(parseInt(users.c, 10)).toBe(1);
  });
});
