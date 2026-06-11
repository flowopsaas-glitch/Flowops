import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  async sendApprovalRequest(data: {
    userEmail: string;
    userId: string;
  }) {
    console.log('📩 ADMIN APPROVAL REQUEST');
    console.log('Email:', data.userEmail);
    console.log('User ID:', data.userId);
    return true;
  }
}
