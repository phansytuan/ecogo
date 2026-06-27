import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { DispatchService } from './dispatch.service';

class AssignDto {
  @IsUUID()
  rideId!: string;
}

@Controller('dispatch')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('dispatcher', 'admin')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('queue')
  queue() {
    return this.dispatch.queue();
  }

  @Get('requests/:id/candidates')
  candidates(@Param('id', ParseUUIDPipe) id: string) {
    return this.dispatch.candidates(id);
  }

  @Post('requests/:id/claim')
  claim(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.dispatch.claim(id, user.id);
  }

  @Post('requests/:id/assign')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatch.assign(id, dto.rideId, user.id);
  }
}
