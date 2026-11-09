import assert from 'node:assert/strict';
import {mariaSql} from '../scripts/export-dataonline.mjs';

const sql = mariaSql({
  Event: [{id: 'event', draftRevisionId: 'draft', publishedRevisionId: 'published'}],
  Invitation: [{id: 'person', familyParentId: 'family'}],
  Wish: [{body: "Chúc mừng 🎓 O'Reilly \\ \n", approvedAt: '2026-11-09T03:02:01.123+07:00', consentPublic: true}],
  EventRevision: [{contentJson: {message: 'Một lời mời'}}],
  ImportBatch: [{resultJson: {created: 1}}],
});
assert(sql.includes('START TRANSACTION;') && sql.includes('COMMIT;'));
assert(sql.includes('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;'));
assert.equal([...sql.matchAll(/USING utf8mb4\)/g)].length, [...sql.matchAll(/USING utf8mb4\) COLLATE utf8mb4_unicode_ci/g)].length);
assert(!sql.includes("O'Reilly"));
assert(sql.includes(Buffer.from('2026-11-08 20:02:01.123').toString('hex')));
assert(sql.includes(Buffer.from(JSON.stringify({message: 'Một lời mời'})).toString('hex')));
assert(sql.includes(Buffer.from(JSON.stringify({created: 1})).toString('hex')));
assert(sql.indexOf('INSERT INTO `Invitation`') < sql.indexOf('UPDATE `Invitation`'));
assert(!/DROP |TRUNCATE |FOREIGN_KEY_CHECKS|INSERT IGNORE/i.test(sql));
console.log('Data Online SQL encoding, timestamps and relation restoration passed.');
