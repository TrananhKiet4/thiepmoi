import type {Invitation} from '@prisma/client';

declare global {namespace Express {interface Request {
 requestId:string;
 admin?:{id:string;email:string;csrfToken:string;sessionId:string};
 invitation?:Pick<Invitation,'id'|'eventId'|'tokenHash'>;
}}}
