import {Router} from 'express';
import {timingSafeEqual} from 'node:crypto';
import {AppError} from '../errors/app-error.js';
import {ok} from '../utils/http.js';
import {runMaintenance} from '../services/maintenance.service.js';

export const maintenanceRouter=Router();
maintenanceRouter.get('/api/maintenance',async(req,res)=>{
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32)throw new AppError(503,'CRON_UNAVAILABLE','Bảo trì chưa được cấu hình');
 const actual=Buffer.from(req.get('Authorization')??''),expected=Buffer.from('Bearer '+secret);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new AppError(401,'AUTH_REQUIRED','Không được phép');
 res.set('Cache-Control','private, no-store');ok(res,await runMaintenance());
});
