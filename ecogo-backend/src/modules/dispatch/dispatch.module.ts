import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { DispatchService } from './dispatch.service';
import { DispatchController } from './dispatch.controller';

@Module({
  imports: [MatchingModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}
