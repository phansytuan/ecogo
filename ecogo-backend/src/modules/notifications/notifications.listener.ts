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
}
