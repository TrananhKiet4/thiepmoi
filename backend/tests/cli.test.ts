import {beforeEach,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {prisma} from '../src/config/database.js';
import {resetTestDatabase} from './helpers.js';
import {contentSchema,assetIds} from '../../packages/contracts/src/index.js';

beforeEach(resetTestDatabase);
it('bootstraps a usable unpublished event without demo seed and never overwrites credentials',async()=>{
 const run=(command='admin',password='Test-Only-Long-Password!')=>spawnSync(process.execPath,['--import','tsx','backend/scripts/cli.ts',command],{env:{...process.env,ADMIN_BOOTSTRAP_EMAIL:'fresh-owner@example.test',ADMIN_BOOTSTRAP_PASSWORD:password},encoding:'utf8',windowsHide:true});
 expect(run().status).toBe(0);
 const admin=await prisma.adminUser.findUniqueOrThrow({where:{email:'fresh-owner@example.test'}}),event=await prisma.event.findFirst({where:{ownerId:admin.id}});
 expect(event).not.toBeNull();expect(event!.publishedRevisionId).toBeNull();expect(event!.draftRevisionId).toBeTruthy();
 const revision=await prisma.eventRevision.findUniqueOrThrow({where:{id:event!.draftRevisionId!}}),content=contentSchema.parse(revision.contentJson);
 expect(content.host.fullName).toBe('');expect(assetIds(content)).toEqual([]);
 expect(run('admin','Short!').status).toBe(0);expect((await prisma.adminUser.findUniqueOrThrow({where:{id:admin.id}})).passwordHash).toBe(admin.passwordHash);
 expect(await prisma.event.count({where:{ownerId:admin.id}})).toBe(1);
 expect(run('seed').status).toBe(0);expect(run('seed').status).toBe(0);
 expect(await prisma.event.count({where:{ownerId:admin.id}})).toBe(1);expect(await prisma.guest.count()).toBe(12);
});
