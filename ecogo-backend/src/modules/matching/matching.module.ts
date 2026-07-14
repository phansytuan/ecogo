import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { RidesModule } from '../rides/rides.module';
import { MatchingService } from './matching.service';
import { MatchingController } from './matching.controller';
import { AssignmentService } from './assignment.service';
import { DetourService } from './detour.service';

@Module({
  imports: [RealtimeModule, RidesModule],
  controllers: [MatchingController],
  providers: [MatchingService, AssignmentService, DetourService],
  exports: [MatchingService, AssignmentService, DetourService],
})
export class MatchingModule {}
