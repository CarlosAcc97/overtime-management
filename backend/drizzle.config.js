/** @type { import("drizzle-kit").Config } */
export default {
  schema: './src/db/schema.js',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:./data/overtime.db',
  },
};
