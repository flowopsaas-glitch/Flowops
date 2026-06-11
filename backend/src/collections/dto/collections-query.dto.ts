import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CollectionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['createdAt', 'name'])
  orderBy: 'createdAt' | 'name' = 'createdAt';

  @IsOptional()
  @IsString()
  name?: string;
}