import { IsIn, IsInt, IsObject, IsOptional } from 'class-validator';

export class OwnerTenantActionDto {
  @IsIn(['SUSPEND', 'REACTIVATE', 'CHANGE_PLAN'])
  action!: 'SUSPEND' | 'REACTIVATE' | 'CHANGE_PLAN';

  @IsOptional()
  @IsInt()
  planId?: number;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}
