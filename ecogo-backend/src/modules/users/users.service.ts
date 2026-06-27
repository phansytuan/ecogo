import { Injectable } from '@nestjs/common';
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
}
