import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { DriverPortalService } from './driver-portal.service';
@Controller('driver-portal')
export class DriverPortalController {
  constructor(private readonly svc: DriverPortalService) {}
  @Public() @Get('deliveries/:driverId')
  async getDeliveries(@Param('driverId') d: string, @Res() res: Response) { res.json(await this.svc.getDriverJobs(d)); }
  @Public() @Post('gps')
  async updateGps(@Body() b: {driverId:string;id?:string;lat:number;lng:number}) { await this.svc.updateGps(b.driverId||b.id,b.lat,b.lng); return {ok:true}; }
  @Public() @Post('pod')
  async uploadPod(@Body() b: any) { return this.svc.recordPod(b); }
  @Public() @Get('chat/messages/:d')
  async getMsgs(@Param('d') d:string,@Query('limit') l:string,@Query('skip') s:string) { return this.svc.getMessages(d,Number(l)||50,Number(s)||0); }
  @Public() @Post('chat/send')
  send(@Body() _:any) { return {ok:true,id:Date.now().toString()}; }
  @Public() @Patch('chat/read/:id')
  markRead(@Param('id') _:string) { return {ok:true}; }
  @Public() @Post('chat/typing/:d')
  setTyping(@Param('d') _:string,@Body() _2:any) { return {ok:true}; }
  @Public() @Get('chat/typing/:d')
  getTyping(@Param('d') _:string) { return {isTyping:false}; }
}
