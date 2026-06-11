import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../auth/enums/role.enum';

export class CreateUserDto {
  @ApiProperty()
  email!: string;

  @ApiProperty()
  password!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty()
  companyId?: string;
}
