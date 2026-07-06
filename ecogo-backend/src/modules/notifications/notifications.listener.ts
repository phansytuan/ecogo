import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';

interface BookingMatchedEvent {
  bookingId: string;
  rideId: string;
  passengerId: string;
  driverId?: string;
  by: 'auto' | 'dispatcher';
}

interface RideCancelledEvent {
  rideId: string;
  driverId: string;
  status: string;
  bookings: { id: string; passengerId: string }[];
}

interface BookingCancelledEvent {
  id: string;
  rideId: string | null;
  passengerId: string;
  driverId: string | null;
  by: string;
}

@Injectable()
export class NotificationsListener {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('booking.matched')
  async onMatched(e: BookingMatchedEvent) {
    await this.notifications.pushToUser(
      e.passengerId,
      'Ghép chuyến thành công',
      'Bạn đã được ghép vào một chuyến đi. Mở app để xem chi tiết.',
      { bookingId: e.bookingId },
    );
    if (e.driverId) {
      await this.notifications.pushToUser(
        e.driverId,
        'Có khách mới',
        'Một hành khách vừa được ghép vào chuyến của bạn.',
        { bookingId: e.bookingId },
      );
    }
  }

  @OnEvent('booking.cancelled')
  async onCancelled(e: BookingCancelledEvent) {
    // Notify the other party — whoever did NOT initiate the cancellation.
    if (e.by === 'driver') {
      await this.notifications.pushToUser(
        e.passengerId,
        'Chuyến đã bị huỷ',
        'Tài xế đã huỷ chỗ của bạn. Mở app để tìm chuyến khác.',
        { bookingId: e.id },
      );
    } else if (e.driverId) {
      await this.notifications.pushToUser(
        e.driverId,
        'Khách đã huỷ',
        'Một hành khách vừa huỷ chỗ trên chuyến của bạn.',
        { bookingId: e.id },
      );
    }
  }

  @OnEvent('ride.cancelled')
  async onRideCancelled(e: RideCancelledEvent) {
    for (const b of e.bookings) {
      await this.notifications.pushToUser(
        b.passengerId,
        'Chuyến đã bị huỷ',
        'Tài xế đã huỷ chuyến. Mở app để tìm chuyến khác.',
        { bookingId: b.id },
      );
    }
  }
}
