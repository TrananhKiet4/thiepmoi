import type {Request} from 'express';
import {Prisma} from '@prisma/client';

declare global {namespace Express {interface Request {
 requestId:string;
 admin?:{id:string;email:string;csrfToken:string;sessionId:string};
 invitation?:Prisma.InvitationGetPayload<{include:{guest:true;event:true;rsvp:true;wish:true}}>;
}}}
