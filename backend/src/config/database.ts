import {PrismaClient,Prisma} from '@prisma/client';
import './env.js';

export const prisma=new PrismaClient();
export type Tx=Prisma.TransactionClient;
export async function withTransaction<T>(fn:(tx:Tx)=>Promise<T>):Promise<T>{
 for(let attempt=0;;attempt++){try{return await prisma.$transaction(fn,{isolationLevel:'Serializable',maxWait:10000,timeout:30000});}catch(error){if(attempt<3&&error instanceof Prisma.PrismaClientKnownRequestError&&(error.code==='P2034'||error.code==='P2002'&&error.meta?.modelName==='InvitationLink'))continue;throw error;}}
}
