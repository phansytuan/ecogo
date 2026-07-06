import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { RidesService } from './rides.service';
import { CreateRideDto } from './rides.dto';

@Controller('rides')
export class RidesController {
  constructor(private readonly rides: RidesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRideDto) {
    return this.rides.create(user.id, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthUser) {
    return this.rides.listByDriver(user.id);
  }

  @Get(':id/bookings')
  @UseGuards(JwtAuthGuard)
  bookings(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.rides.bookingsForRide(id, user.id);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.rides.cancel(id, user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rides.findById(id);
  }
}
