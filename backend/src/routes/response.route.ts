import {Router} from 'express';
import {requireAdmin,requireGuest} from '../middleware/auth.middleware.js';
import {getGuestInvitation,postGuestFamilyResponder,postGuestOpened,putGuestRsvp,putGuestWish,patchGuestWishVisibility,deleteGuestWish,getGuestWishes,getGuestCalendarIcs,getAdminEventsWishes,patchAdminWishesModeration,patchAdminWishesPin} from '../controllers/response.controller.js';

export const guestRouter=Router();
export const wishesAdminRouter=Router();
guestRouter.get('/guest/invitation',requireGuest,getGuestInvitation);
guestRouter.post('/guest/opened',requireGuest,postGuestOpened);
guestRouter.post('/guest/family-responders',requireGuest,postGuestFamilyResponder);
guestRouter.put('/guest/rsvp',requireGuest,putGuestRsvp);
guestRouter.put('/guest/wish',requireGuest,putGuestWish);
guestRouter.patch('/guest/wish/visibility',requireGuest,patchGuestWishVisibility);
guestRouter.delete('/guest/wish',requireGuest,deleteGuestWish);
guestRouter.get('/guest/wishes',requireGuest,getGuestWishes);
guestRouter.get('/guest/calendar.ics',requireGuest,getGuestCalendarIcs);
wishesAdminRouter.get('/admin/events/:id/wishes',requireAdmin,getAdminEventsWishes);
wishesAdminRouter.patch('/admin/wishes/:id/moderation',requireAdmin,patchAdminWishesModeration);
wishesAdminRouter.patch('/admin/wishes/:id/pin',requireAdmin,patchAdminWishesPin);
