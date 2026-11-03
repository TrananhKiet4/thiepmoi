import {Router} from 'express';
import {requireAdmin} from '../middleware/auth.middleware.js';
import {getAdminMediaFile,getMediaKey,getAdminEventsMedia,postAdminEventsMediaMiddleware1,postAdminEventsMedia,patchAdminMedia,deleteAdminMedia} from '../controllers/media.controller.js';

export const mediaRouter=Router();
mediaRouter.get('/admin/media/file',requireAdmin,getAdminMediaFile);
mediaRouter.get('/media/{*key}',getMediaKey);
mediaRouter.get('/admin/events/:id/media',requireAdmin,getAdminEventsMedia);
mediaRouter.post('/admin/events/:id/media',requireAdmin,postAdminEventsMediaMiddleware1,postAdminEventsMedia);
mediaRouter.patch('/admin/media/:id',requireAdmin,patchAdminMedia);
mediaRouter.delete('/admin/media/:id',requireAdmin,deleteAdminMedia);
