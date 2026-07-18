import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

type KycStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

class SetKycDto {
  @IsIn(['pending', 'verified', 'rejected', 'suspended'])
  status!: KycStatus;

  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch(':id/kyc')
  @Roles('admin')
  setKyc(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetKycDto,
  ) {
    return this.users.setKycStatus(user.id, id, dto.status, dto.reason);
  }
}
