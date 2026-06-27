import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateVehicleDto } from './vehicles.controller';

export interface VehicleRow {
  id: string;
  driver_id: string;
  type: string;
  plate: string;
  model: string | null;
  seats: number;
  is_ev: boolean;
}

@Injectable()
export class VehiclesService {
  constructor(private readonly db: DatabaseService) {}

  create(driverId: string, dto: CreateVehicleDto): Promise<VehicleRow | null> {
    return this.db.one<VehicleRow>(
      `INSERT INTO vehicles (driver_id, type, plate, model, seats, is_ev)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [driverId, dto.type, dto.plate, dto.model ?? null, dto.seats, dto.isEv ?? false],
    );
  }

  listByDriver(driverId: string): Promise<VehicleRow[]> {
    return this.db.query<VehicleRow>(
      'SELECT * FROM vehicles WHERE driver_id = $1 ORDER BY created_at DESC',
      [driverId],
    );
  }

  findOwned(id: string, driverId: string): Promise<VehicleRow | null> {
    return this.db.one<VehicleRow>(
      'SELECT * FROM vehicles WHERE id = $1 AND driver_id = $2',
      [id, driverId],
    );
  }
}
