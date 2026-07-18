import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OtpService } from './otp.service';
import { JwtStrategy } from './jwt.strategy';
import { EsmsSender, FakeSmsSender, SMS_SENDER } from './sms.provider';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.accessExpiresIn') as JwtSignOptions['expiresIn'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    JwtStrategy,
    FakeSmsSender,
    EsmsSender,
    {
      provide: SMS_SENDER,
      inject: [ConfigService, FakeSmsSender, EsmsSender],
      useFactory: (
        config: ConfigService,
        fake: FakeSmsSender,
        esms: EsmsSender,
      ) => (config.get<string>('otpProvider') === 'esms' ? esms : fake),
    },
  ],
})
export class AuthModule {}
