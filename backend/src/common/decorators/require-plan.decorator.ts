// src/common/decorators/require-plan.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { Plan } from '../enums/plan.enum';

export const REQUIRE_PLAN_KEY = 'requirePlan';
export const RequirePlan = (plans: Plan[]) => SetMetadata(REQUIRE_PLAN_KEY, plans);
