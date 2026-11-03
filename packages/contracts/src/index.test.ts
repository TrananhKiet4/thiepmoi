import {expect,it} from 'vitest';
import {contentSchema,publicationErrors,guestSchema} from './index.js';
import {demoContent} from '../../../backend/prisma/data/demo.js';
it('allows clearing required dates in a draft but rejects publication until completed',()=>{
 const draft=demoContent(null);draft.ceremony.startAt='';draft.ceremony.endAt='';draft.rsvpDeadline='';
 const result=contentSchema.safeParse(draft);expect(result.success).toBe(true);
 const errors=publicationErrors(result.success?result.data:draft);
 expect(errors['ceremony.startAt']).toBeTruthy();expect(errors['ceremony.endAt']).toBeTruthy();expect(errors.rsvpDeadline).toBeTruthy();
});
it('normalizes equivalent Vietnamese group labels to the same template key',()=>{
 expect(guestSchema.parse({guestCode:'a',fullName:'An',groupKey:'  Bạn Bè 2026  '}).groupKey).toBe('ban_be_2026');
});
