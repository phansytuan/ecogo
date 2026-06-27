import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { VehiclesService } from './vehicles.service';
import { UsersService } from '../users/users.service';

export class CreateVehicleDto {
  @IsIn(['limousine', 'car_4', 'car_7', 'van_16'])
  type!: string;

  @IsString()
  plate!: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsInt()
  @Min(1)
  seats!: number;

  @IsOptional()
  @IsBoolean()
  isEv?: boolean;
}

@Controller('vehicles')
@UseGuards(JwtAuthGuard)
export class VehiclesController {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly users: UsersService,
  ) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) {
    await this.users.addRole(user.id, 'driver');
    return this.vehicles.create(user.id, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.vehicles.listByDriver(user.id);
  }
}
