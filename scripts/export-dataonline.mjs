import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const tables = ['AdminUser', 'AdminSession', 'Event', 'EventRevision', 'Guest', 'Invitation', 'InvitationLink', 'RSVP', 'Wish', 'ImportBatch', 'AuditLog', 'IdempotencyRecord', 'TemporaryObject', 'RateLimitBucket'];
const jsonColumns = new Set(['contentJson', 'mappingJson', 'normalizedRowsJson', 'summaryJson', 'resultJson', 'metadata', 'responseJson']);
let exportStage = 'connect';
const identifier = value => {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) throw new Error('Invalid SQL identifier');
  return '`' + value + '`';
};
function literal(value, field) {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('Unsafe numeric value');
    return String(value);
  }
  let text = jsonColumns.has(field) ? JSON.stringify(value) : value;
  if (typeof text !== 'string') throw new Error('Unexpected value in ' + field);
  if (field.endsWith('At')) {
    const date = new Date(text);
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid timestamp');
    text = date.toISOString().replace('T', ' ').replace('Z', '');
  }
  return "CONVERT(X'" + Buffer.from(text).toString('hex') + "' USING utf8mb4) COLLATE utf8mb4_unicode_ci";
}

export function mariaSql(snapshot) {
  const sql = ['-- Import into the empty 14-table MariaDB schema using phpMyAdmin.', "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;", "SET time_zone = '+00:00';", 'START TRANSACTION;'];
  for (const table of tables) {
    for (const row of snapshot[table] ?? []) {
      const saved = {...row};
      if (table === 'Event') Object.assign(saved, {draftRevisionId: null, publishedRevisionId: null});
      if (table === 'Invitation') saved.familyParentId = null;
      const fields = Object.keys(saved);
      sql.push(`INSERT INTO ${identifier(table)} (${fields.map(identifier).join(', ')}) VALUES (${fields.map(field => literal(saved[field], field)).join(', ')});`);
    }
  }
  for (const row of snapshot.Event ?? []) {
    sql.push('UPDATE `Event` SET `draftRevisionId` = ' + literal(row.draftRevisionId, 'draftRevisionId') + ', `publishedRevisionId` = ' + literal(row.publishedRevisionId, 'publishedRevisionId') + ' WHERE `id` = ' + literal(row.id, 'id') + ';');
  }
  for (const row of snapshot.Invitation ?? []) {
    if (row.familyParentId !== null) sql.push('UPDATE `Invitation` SET `familyParentId` = ' + literal(row.familyParentId, 'familyParentId') + ' WHERE `id` = ' + literal(row.id, 'id') + ';');
  }
  sql.push('COMMIT;');
  for (const table of tables) sql.push('SELECT ' + literal(table, 'table') + ' AS `table_name`, COUNT(*) AS `rows_imported` FROM ' + identifier(table) + ';');
  return sql.join('\n') + '\n';
}

async function main() {
  const output = process.argv[2];
  if (!output || !process.env.DATABASE_URL) throw new Error('Usage: node --env-file=.env.production.local scripts/export-dataonline.mjs .data/backups/dataonline-data.sql');
  const target = resolve(output);
  const {PrismaClient} = await import('@prisma/client');
  const client = new PrismaClient({datasources: {db: {url: process.env.DIRECT_URL || process.env.DATABASE_URL}}, log: []});
  try {
    const snapshot = await client.$transaction(async transaction => {
      await transaction.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const data = {};
      for (const table of tables) {
        exportStage = 'read '+table;
        const rows = await transaction.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${table}" t`);
        data[table] = rows.map(item => JSON.parse(item.row));
      }
      return data;
    }, {isolationLevel: 'RepeatableRead', timeout: 120_000, maxWait: 10_000});
    mkdirSync(dirname(target), {recursive: true});
    exportStage = 'encode MariaDB SQL';
    const sql = mariaSql(snapshot);
    exportStage = 'write backup';
    writeFileSync(target, sql, {flag: 'wx', mode: 0o600});
    writeFileSync(target + '.counts.json', JSON.stringify(Object.fromEntries(tables.map(table => [table, snapshot[table].length])), null, 2), {flag: 'wx', mode: 0o600});
    console.log('MariaDB data export saved locally. Keep the SQL file private and import it only into the empty Data Online database.');
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const code = /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'EXPORT_FAILED';
    const state = /^[A-Z0-9]{5}$/.test(error.meta?.code ?? '') ? error.meta.code : undefined;
    const detail = /^(Invalid timestamp|Unsafe numeric value|Invalid SQL identifier|Unexpected value in [A-Za-z]+)$/.test(error.message) ? error.message : undefined;
    console.error(JSON.stringify({error: code, type: error.name, stage: exportStage, sqlState: state, detail, message: 'Export failed. Check the source connection and choose a new output file. Credentials and private records are not logged.'}));
    process.exitCode = 1;
  });
}
