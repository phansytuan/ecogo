import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { NotificationsService } from './notifications.service';

class RegisterTokenDto {
  @IsString()
  token!: string;

  @IsOptional()
  @IsIn(['ios', 'android', 'web'])
  platform?: string;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('token')
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterTokenDto) {
    return this.notifications.registerToken(user.id, dto.token, dto.platform);
  }
}
