import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { MatchingService } from './matching.service';
import { MatchingController } from './matching.controller';
import { AssignmentService } from './assignment.service';

@Module({
  imports: [RealtimeModule],
  controllers: [MatchingController],
  providers: [MatchingService, AssignmentService],
  exports: [MatchingService, AssignmentService],
})
export class MatchingModule {}
