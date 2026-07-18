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

interface RideCompletedEvent {
  rideId: string;
  driverId: string;
  bookings: { id: string; passengerId: string }[];
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

interface RideRequiresReviewEvent {
  rideId: string;
  driverId: string;
}

interface RideStartedEvent {
  rideId: string;
  driverId: string;
  bookings: { id: string; passengerId: string }[];
}

interface ReferralClaimedEvent {
  referralId: string;
  driverId: string;
  referredUserId: string;
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

  @OnEvent('ride.completed')
  async onRideCompleted(e: RideCompletedEvent) {
    for (const b of e.bookings) {
      await this.notifications.pushToUser(
        b.passengerId,
        'Chuyến đã hoàn thành',
        'Cảm ơn bạn đã đi cùng ECOGO. Hãy đánh giá tài xế nhé!',
        { bookingId: b.id },
      );
    }
  }

  @OnEvent('ride.requires_review')
  async onRideRequiresReview(e: RideRequiresReviewEvent) {
    await this.notifications.pushToUser(
      e.driverId,
      'Chuyến chưa được hoàn thành',
      'Chuyến của bạn đã quá giờ dự kiến. Mở app để bấm hoàn thành hoặc liên hệ điều phối.',
      { rideId: e.rideId },
    );
  }

  @OnEvent('ride.started')
  async onRideStarted(e: RideStartedEvent) {
    for (const booking of e.bookings) {
      await this.notifications.pushToUser(
        booking.passengerId,
        'Chuyến đã bắt đầu',
        'Tài xế đã bắt đầu chuyến của bạn. Chuẩn bị ra điểm đón nhé!',
        { bookingId: booking.id },
      );
    }
  }
  @OnEvent('referral.claimed')
  async onReferralClaimed(e: ReferralClaimedEvent) {
    await this.notifications.pushToUser(
      e.referredUserId,
      'Xác nhận người giới thiệu',
      'Một tài xế cho biết đã giới thiệu bạn đến ECOGO. Mở app để xác nhận hoặc từ chối.',
      { referralId: e.referralId },
    );
  }
}
