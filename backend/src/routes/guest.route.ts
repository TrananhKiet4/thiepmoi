import {Router} from 'express';
import {requireAdmin} from '../middleware/auth.middleware.js';
import {getAdminEventsGuests,postAdminEventsGuests,patchAdminGuests,postAdminGuestsAction,deleteAdminGuest,getAdminInvitationsLink,patchAdminInvitationContent,postAdminInvitationsAction,putAdminInvitationsRsvp} from '../controllers/guest.controller.js';

export const guestsRouter=Router();
guestsRouter.get('/admin/events/:id/guests',requireAdmin,getAdminEventsGuests);
guestsRouter.post('/admin/events/:id/guests',requireAdmin,postAdminEventsGuests);
guestsRouter.patch('/admin/guests/:id',requireAdmin,patchAdminGuests);
guestsRouter.delete('/admin/guests/:id',requireAdmin,deleteAdminGuest);
for(const action of ['archive','restore'] as const)guestsRouter.post(`/admin/guests/:id/${action}`,requireAdmin,postAdminGuestsAction(action));
guestsRouter.get('/admin/invitations/:id/link',requireAdmin,getAdminInvitationsLink);
guestsRouter.patch('/admin/invitations/:id/content',requireAdmin,patchAdminInvitationContent);
for(const action of ['revoke','rotate'] as const)guestsRouter.post(`/admin/invitations/:id/${action}`,requireAdmin,postAdminInvitationsAction(action));
guestsRouter.put('/admin/invitations/:id/rsvp',requireAdmin,putAdminInvitationsRsvp);
