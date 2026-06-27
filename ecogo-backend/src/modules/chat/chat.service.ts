import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class ChatService {
  constructor(
    private readonly db: DatabaseService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Only the booking's passenger or the matched ride's driver may use the thread. */
  private async assertMember(bookingId: string, userId: string) {
    const row = await this.db.one<{ passenger_id: string; driver_id: string | null }>(
      `SELECT b.passenger_id, r.driver_id
       FROM bookings b LEFT JOIN rides r ON r.id = b.ride_id
       WHERE b.id = $1`,
      [bookingId],
    );
    if (!row) throw new NotFoundException('Booking not found');
    if (row.passenger_id !== userId && row.driver_id !== userId) {
      throw new ForbiddenException('Not a participant of this booking');
    }
  }

  async send(bookingId: string, senderId: string, body: string) {
    await this.assertMember(bookingId, senderId);
    const msg = await this.db.one(
      `INSERT INTO messages (booking_id, sender_id, body)
       VALUES ($1,$2,$3) RETURNING id, booking_id, sender_id, body, created_at`,
      [bookingId, senderId, body],
    );
    this.realtime.emitToChat(bookingId, 'chat:message', msg);
    return msg;
  }

  async list(bookingId: string, userId: string) {
    await this.assertMember(bookingId, userId);
    return this.db.query(
      `SELECT id, sender_id, body, created_at
       FROM messages WHERE booking_id = $1 ORDER BY created_at ASC`,
      [bookingId],
    );
  }
}
