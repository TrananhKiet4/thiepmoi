import {Router} from 'express';
import {requireAdmin} from '../middleware/auth.middleware.js';
import {receive} from '../controllers/import.controller.js';
import {getAdminImportsTemplate,postAdminEventsImportsInspect,postAdminEventsImportsPreview,getAdminImports,getAdminImportsReport,postAdminImportsCommit,getAdminEventsExports} from '../controllers/import.controller.js';

export const importRouter=Router();
importRouter.get('/admin/imports/template',requireAdmin,getAdminImportsTemplate);
importRouter.post('/admin/events/:id/imports/inspect',requireAdmin,receive,postAdminEventsImportsInspect);
importRouter.post('/admin/events/:id/imports/preview',requireAdmin,receive,postAdminEventsImportsPreview);
importRouter.get('/admin/imports/:id',requireAdmin,getAdminImports);
importRouter.get('/admin/imports/:id/report',requireAdmin,getAdminImportsReport);
importRouter.post('/admin/imports/:id/commit',requireAdmin,postAdminImportsCommit);
importRouter.get('/admin/events/:id/exports/:kind',requireAdmin,getAdminEventsExports);
