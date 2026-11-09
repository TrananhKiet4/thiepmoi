import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mariaSql} from '../scripts/export-dataonline.mjs';

const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const hash = text => createHash('sha256').update(text).digest('hex');
const date = '2026-11-09T03:02:01.123Z';
const snapshot = {
  AdminUser: [{id: id(1), email: 'fixture@example.invalid', passwordHash: 'synthetic-fixture'}],
  Event: [{id: id(2), ownerId: id(1), slug: 'fixture', draftRevisionId: id(3), publishedRevisionId: id(3), updatedAt: date}],
  EventRevision: [{id: id(3), eventId: id(2), revisionNo: 1, contentJson: {title: 'Lễ tốt nghiệp 🎓', message: "Chúc mừng O'Reilly \\"}}],
  Guest: [
    {id: id(4), eventId: id(2), guestCode: 'FAMILY', fullName: 'Đại gia đình thử nghiệm', updatedAt: date},
    {id: id(5), eventId: id(2), guestCode: 'PERSON', fullName: 'Người phản hồi', updatedAt: date},
  ],
  Invitation: [
    {id: id(6), eventId: id(2), guestId: id(4), familyParentId: null, allowMultipleResponses: true, tokenHash: hash('parent'), tokenCiphertext: 'synthetic-parent', keyVersion: '1', updatedAt: date},
    {id: id(7), eventId: id(2), guestId: id(5), familyParentId: id(6), allowMultipleResponses: false, tokenHash: hash('child'), tokenCiphertext: 'synthetic-child', keyVersion: '1', updatedAt: date},
  ],
  InvitationLink: [
    {codeHash: hash('active'), invitationId: id(6), tokenHash: hash('parent'), slug: 'family', codeCiphertext: 'synthetic-code', keyVersion: '1', restoredTokenHash: null},
    {codeHash: hash('retired'), invitationId: null, tokenHash: '', slug: '', codeCiphertext: '', keyVersion: '', restoredTokenHash: null},
  ],
  RSVP: [{id: id(8), invitationId: id(7), status: 'ATTENDING', updatedAt: date}],
  Wish: [{id: id(9), invitationId: id(7), body: 'Chúc mừng tốt nghiệp 🎓', consentPublic: true, consentAttendancePublic: true, moderationStatus: 'APPROVED', approvedAt: date, approvedBy: id(1), updatedAt: date}],
};
const result = spawnSync(process.env.PHP_BINARY || 'php', ['tests/dataonline-import-smoke.php'], {
  input: JSON.stringify({snapshot, sql: mariaSql(snapshot)}), encoding: 'utf8', windowsHide: true,
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exitCode = result.status ?? 1;
