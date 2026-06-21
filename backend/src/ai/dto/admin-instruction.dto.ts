import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminInstructionDto {
  @ApiProperty({ 
    description: 'The natural language command for the AI Claw',
    example: 'Audit billing batch #1' 
  })
  @IsString()
  @IsNotEmpty()
  command: string;

  @ApiProperty({ 
    description: 'Where the command was issued (e.g., Terminal, Dashboard)',
    required: false, 
    example: 'General Admin Terminal' 
  })
  @IsString()
  @IsOptional()
  context?: string;
}
