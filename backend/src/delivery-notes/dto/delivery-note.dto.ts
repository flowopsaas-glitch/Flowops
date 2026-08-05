import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum NotePriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum NoteCategory {
  INSTRUCTION = 'INSTRUCTION',
  ISSUE = 'ISSUE',
  UPDATE = 'UPDATE',
  GENERAL = 'GENERAL',
}

export class CreateDeliveryNoteDto {
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() @IsString() waybillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(NotePriority) priority?: NotePriority;
  @ApiPropertyOptional() @IsOptional() @IsEnum(NoteCategory) category?: NoteCategory;
}

export class UpdateDeliveryNoteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(NotePriority) priority?: NotePriority;
  @ApiPropertyOptional() @IsOptional() @IsEnum(NoteCategory) category?: NoteCategory;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isResolved?: boolean;
}
