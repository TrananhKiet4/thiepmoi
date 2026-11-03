import {Router} from 'express';
import {requireAdmin} from '../middleware/auth.middleware.js';
import {getAdminEventsGuests,postAdminEventsGuests,patchAdminGuests,postAdminGuestsAction,getAdminInvitationsLink,postAdminInvitationsAction,putAdminInvitationsRsvp} from '../controllers/guest.controller.js';

export const guestsRouter=Router();
guestsRouter.get('/admin/events/:id/guests',requireAdmin,getAdminEventsGuests);
guestsRouter.post('/admin/events/:id/guests',requireAdmin,postAdminEventsGuests);
guestsRouter.patch('/admin/guests/:id',requireAdmin,patchAdminGuests);
for(const action of ['archive','restore'] as const)guestsRouter.post(`/admin/guests/:id/${action}`,requireAdmin,postAdminGuestsAction(action));
guestsRouter.get('/admin/invitations/:id/link',requireAdmin,getAdminInvitationsLink);
for(const action of ['revoke','rotate'] as const)guestsRouter.post(`/admin/invitations/:id/${action}`,requireAdmin,postAdminInvitationsAction(action));
guestsRouter.put('/admin/invitations/:id/rsvp',requireAdmin,putAdminInvitationsRsvp);
