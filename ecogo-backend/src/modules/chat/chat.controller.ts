import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { ChatService } from './chat.service';
import { SendMessageDto } from './chat.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post(':bookingId/messages')
  send(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.send(bookingId, user.id, dto.body);
  }

  @Get(':bookingId/messages')
  list(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentUser() user: AuthUser) {
    return this.chat.list(bookingId, user.id);
  }
}
