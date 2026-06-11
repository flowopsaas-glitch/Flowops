import {
  Controller, Get, Post, Delete,
  Body, Param, Query, Req, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GpsTrackingService } from './gps-tracking.service';
import { UpdateLocationDto } from './dto/update-location.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { CreateGeofenceDto } from './dto/create-geofence.dto';

@Controller('gps-tracking')
@UseGuards(JwtAuthGuard)
export class GpsTrackingController {
  constructor(private readonly gpsService: GpsTrackingService) {}

  @Post('location')
  async updateLocation(@Body() dto: UpdateLocationDto) {
    return this.gpsService.updateLocation(dto.driverId, dto);
  }

  @Get('drivers/locations')
  async getAllDriverLocations(@Req() req: any) {
    return this.gpsService.getAllDriverLocations(req.user.companyId);
  }

  @Get('drivers/:driverId/location')
  async getDriverLocation(@Param('driverId', ParseIntPipe) driverId: number) {
    return this.gpsService.getDriverLocation(driverId);
  }

  @Get('drivers/:driverId/history')
  async getDriverHistory(
    @Param('driverId', ParseIntPipe) driverId: number,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
  ) {
    return this.gpsService.getDriverHistory(driverId, new Date(startTime), new Date(endTime));
  }

  @Post('trips')
  async createTrip(@Body() dto: CreateTripDto, @Req() req: any) {
    return this.gpsService.createTrip(req.user.companyId, dto);
  }

  @Post('trips/:id/start')
  async startTrip(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.gpsService.startTrip(id, req.user.companyId);
  }

  @Post('trips/:id/complete')
  async completeTrip(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body('actualDistance') actualDistance?: number,
  ) {
    return this.gpsService.completeTrip(id, req.user.companyId, actualDistance);
  }

  @Get('trips')
  async getTrips(
    @Req() req: any,
    @Query('driverId') driverId?: string,
    @Query('status') status?: string,
  ) {
    return this.gpsService.getTrips(req.user.companyId, {
      driverId: driverId ? parseInt(driverId) : undefined,
      status,
    });
  }

  @Get('trips/:id')
  async getTrip(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.gpsService.getTrip(id, req.user.companyId);
  }

  @Get('trips/:id/analytics')
  async getTripAnalytics(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.gpsService.getTripAnalytics(id, req.user.companyId);
  }

  @Post('geofences')
  async createGeofence(@Body() dto: CreateGeofenceDto, @Req() req: any) {
    return this.gpsService.createGeofence(req.user.companyId, dto);
  }

  @Get('geofences')
  async getGeofences(@Req() req: any) {
    return this.gpsService.getGeofences(req.user.companyId);
  }

  @Delete('geofences/:id')
  async deleteGeofence(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.gpsService.deleteGeofence(id, req.user.companyId);
  }

  @Get('geofences/alerts')
  async getGeofenceAlerts(@Req() req: any, @Query('unreadOnly') unreadOnly?: string) {
    return this.gpsService.getGeofenceAlerts(req.user.companyId, unreadOnly === 'true');
  }
}
