import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { RidesService } from './rides.service';
import { CharterCheckDto, CharterOptOutDto, CreateRideDto, QuoteDto } from './rides.dto';

@Controller('rides')
export class RidesController {
  constructor(private readonly rides: RidesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRideDto) {
    return this.rides.create(user.id, dto);
  }

  @Post('quote')
  @UseGuards(JwtAuthGuard)
  quote(@Body() dto: QuoteDto) {
    return this.rides.quote(dto.origin, dto.dest);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthUser) {
    return this.rides.listByDriver(user.id);
  }

  @Get(':id/itinerary')
  @UseGuards(JwtAuthGuard)
  itinerary(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.rides.itinerary(id, user.id);
  }

  @Get(':id/route')
  @UseGuards(JwtAuthGuard)
  dynamicRoute(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.rides.dynamicRoute(id, user.id);
  }

  @Get(':id/charter')
  @UseGuards(JwtAuthGuard)
  charter(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.rides.charterStatus(id, user.id);
  }

  @Post(':id/charter/check')
  @UseGuards(JwtAuthGuard)
  charterCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CharterCheckDto,
  ) {
    return this.rides.checkCharter(id, user.id, dto.from, dto.charterDurationS ?? 0);
  }

  @Post(':id/charter/opt-out')
  @UseGuards(JwtAuthGuard)
  charterOptOut(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CharterOptOutDto,
  ) {
    return this.rides.setCharterOptOut(id, user.id, dto.optOut);
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

  @Post(':id/complete')
  @UseGuards(JwtAuthGuard)
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.rides.complete(id, user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rides.findById(id);
  }
}
