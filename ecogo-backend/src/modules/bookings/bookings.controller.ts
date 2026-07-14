import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, QuoteBookingDto } from './bookings.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookings.create(user.id, dto);
  }

  /** Passenger fare quote: road distance x bracket rate, before choosing a ride. */
  @Post('quote')
  quote(@Body() dto: QuoteBookingDto) {
    return this.bookings.quote(dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.bookings.listForPassenger(user.id);
  }

  @Post(':id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.bookings.confirm(id, user.id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.bookings.cancel(id, user.id);
  }
}
