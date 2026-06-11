import { SetMetadata } from '@nestjs/common';
import { Plan } from '../enums/plan.enum';

export const REQUIRE_PLAN_KEY = 'require_plan';

export const RequirePlan = (...plans: Plan[]) =>
  SetMetadata(REQUIRE_PLAN_KEY, plans);
