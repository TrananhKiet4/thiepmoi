import {Router} from 'express';
import {z} from 'zod';
import {requireAdmin} from '../middleware/auth.middleware.js';
import {ok} from '../utils/http.js';
import {createUpload} from '../services/temporary-object.service.js';

export const uploadRouter=Router();
uploadRouter.post('/admin/events/:id/uploads',requireAdmin,async(req,res)=>ok(res,await createUpload(req,z.string().uuid().parse(req.params.id),req.body)));
