// Adapt the existing bound-query API to PostgreSQL without changing stopwatch logic.
export class PostgresStorage {
  constructor(pool) { this.pool = pool; }
  prepare(sql) {
    const pool = this.pool;
    let index = 0;
    let statement = sql.replace(/\?/g, () => `$${++index}`);
    if (statement.startsWith('INSERT OR IGNORE')) statement = statement.replace('INSERT OR IGNORE', 'INSERT') + ' ON CONFLICT (id) DO NOTHING';
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() { return (await pool.query(statement, this.values)).rows[0] || null; },
      async run() { const result = await pool.query(statement, this.values); return { meta: { changes: result.rowCount || 0 } }; }
    };
  }
}
