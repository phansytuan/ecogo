import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface UserRow {
  id: string;
  phone: string;
  full_name: string | null;
  roles: string[];
  rating: string | null;
  kyc_status: string;
  created_at: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  findByPhone(phone: string): Promise<UserRow | null> {
    return this.db.one<UserRow>('SELECT * FROM users WHERE phone = $1', [phone]);
  }

  findById(id: string): Promise<UserRow | null> {
    return this.db.one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  }

  async findOrCreateByPhone(phone: string): Promise<UserRow> {
    const existing = await this.findByPhone(phone);
    if (existing) return existing;
    const created = await this.db.one<UserRow>(
      `INSERT INTO users (phone) VALUES ($1) RETURNING *`,
      [phone],
    );
    return created as UserRow;
  }

  async addRole(userId: string, role: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET roles = (
         SELECT ARRAY(SELECT DISTINCT unnest(roles || $2::text)) FROM users WHERE id = $1
       ) WHERE id = $1`,
      [userId, role],
    );
  }
  async setKycStatus(
    actorId: string,
    userId: string,
    status: string,
    reason?: string,
  ) {
    return this.db.tx(async (client) => {
      const user = (
        await client.query<{ id: string; kyc_status: string }>(
          `SELECT id, kyc_status FROM users WHERE id = $1 FOR UPDATE`,
          [userId],
        )
      ).rows[0];
      if (!user) throw new NotFoundException('User not found');

      if (user.kyc_status === status) {
        return { id: userId, kycStatus: status, changed: false };
      }

      await client.query(
        `UPDATE users SET kyc_status = $2 WHERE id = $1`,
        [userId, status],
      );
      await client.query(
        `INSERT INTO audit_log
           (actor_id, action, entity_type, entity_id, details)
         VALUES ($1, 'user.kyc.updated', 'user', $2, $3::jsonb)`,
        [
          actorId,
          userId,
          JSON.stringify({
            oldStatus: user.kyc_status,
            newStatus: status,
            reason: reason ?? null,
          }),
        ],
      );

      return { id: userId, kycStatus: status, changed: true };
    });
  }
}
