import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { MatchingModule } from '../matching/matching.module';
import { DispatchService } from './dispatch.service';
import { DispatchController } from './dispatch.controller';

@Module({
  imports: [MatchingModule, RealtimeModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}
