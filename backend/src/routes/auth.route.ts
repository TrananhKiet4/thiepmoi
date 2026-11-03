import {Router} from 'express';
import {checkOrigin} from '../middleware/auth.middleware.js';
import {requireAdmin} from '../middleware/auth.middleware.js';
import {loginIpLimit} from '../middleware/rate-limit.middleware.js';
import {loginAccountLimit} from '../middleware/rate-limit.middleware.js';
import {postAdminAuthLogin,getAdminAuthMe,postAdminAuthLogout} from '../controllers/auth.controller.js';

export const authRouter=Router();
authRouter.post('/admin/auth/login',checkOrigin,loginIpLimit,loginAccountLimit,postAdminAuthLogin);
authRouter.get('/admin/auth/me',requireAdmin,getAdminAuthMe);
authRouter.post('/admin/auth/logout',checkOrigin,requireAdmin,postAdminAuthLogout);
