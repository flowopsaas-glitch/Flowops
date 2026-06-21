import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class DriverPortalService {
  constructor(private prisma: PrismaService) {}
  async getDriverJobs(driverId: string) {
    const [cols, ships] = await Promise.all([
      this.prisma.collection.findMany({where:{driverId,status:{in:['ASSIGNED','PENDING','IN_PROGRESS']}},orderBy:{createdAt:'desc'}}),
      this.prisma.shipment.findMany({where:{driverId,status:{in:['PENDING','IN_TRANSIT']}},orderBy:{createdAt:'desc'}}),
    ]);
    const wbIds = ships.map((s:any)=>s.waybillId);
    const wbs = wbIds.length ? await this.prisma.waybill.findMany({where:{id:{in:wbIds}},select:{id:true,trackingNumber:true,status:true,recipientName:true,recipientPhone:true,recipientAddress:true,recipientLat:true,recipientLng:true,senderName:true,senderAddress:true,weight:true,totalAmount:true,codAmount:true,codCollected:true}}) : [];
    const wbMap:any = Object.fromEntries(wbs.map((w:any)=>[w.id,w]));
    return [
      ...cols.map((c:any)=>({id:c.id,type:'collection',status:'PENDING',trackingNumber:'COL-'+c.id.slice(-6).toUpperCase(),recipientName:c.clientName||'Client',recipientPhone:c.clientPhone,recipientAddress:c.pickupAddress,recipientLat:c.pickupLat,recipientLng:c.pickupLng,notes:c.notes,scheduledAt:c.scheduledAt,createdAt:c.createdAt})),
      ...ships.map((s:any)=>{const w=wbMap[s.waybillId]||{};return{id:s.id,type:'delivery',status:s.status,trackingNumber:w.trackingNumber||s.id,recipientName:w.recipientName||'Recipient',recipientPhone:w.recipientPhone,recipientAddress:w.recipientAddress,recipientLat:w.recipientLat||s.currentLat,recipientLng:w.recipientLng||s.currentLng,senderName:w.senderName,senderAddress:w.senderAddress,weight:w.weight,totalAmount:w.totalAmount,codAmount:w.codAmount,codCollected:w.codCollected,waybillId:s.waybillId,createdAt:s.createdAt};}),
    ];
  }
  async updateGps(id:string,lat:number,lng:number){return this.prisma.driver.update({where:{id},data:{lastLat:lat,lastLng:lng,lastSeen:new Date()}});}
  async recordPod(b:any){return this.prisma.waybill.update({where:{id:b.waybillId},data:{status:'DELIVERED',podSignatureUrl:b.signatureUrl,podImageUrl:b.imageUrl,podRecipient:b.recipientName}});}
  async getMessages(_d:string,_l:number,_s:number){return [];}
}
