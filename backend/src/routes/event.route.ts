import {Router} from 'express';
import {requireAdmin} from '../middleware/auth.middleware.js';
import {getAdminEventsCurrent,patchAdminEventsDraft,postAdminEventsAction,patchAdminEventsControls,getAdminEventsPreview,getAdminEventsDashboard} from '../controllers/event.controller.js';

export const eventsRouter=Router();
eventsRouter.get('/admin/events/current',requireAdmin,getAdminEventsCurrent);
eventsRouter.patch('/admin/events/:id/draft',requireAdmin,patchAdminEventsDraft);
for(const action of ['publish','unpublish'] as const)eventsRouter.post(`/admin/events/:id/${action}`,requireAdmin,postAdminEventsAction(action));
eventsRouter.patch('/admin/events/:id/controls',requireAdmin,patchAdminEventsControls);
eventsRouter.get('/admin/events/:id/preview',requireAdmin,getAdminEventsPreview);
eventsRouter.get('/admin/events/:id/dashboard',requireAdmin,getAdminEventsDashboard);
