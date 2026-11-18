import { Module } from '@nestjs/common';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';
import { ExerciseValidator } from './exercise.validator';
import { ClusterService } from './cluster.service';

@Module({
  controllers: [ExercisesController],
  providers: [ExercisesService, ExerciseValidator, ClusterService],
  exports: [ExercisesService, ExerciseValidator, ClusterService],
})
export class ExercisesModule {}
