"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPasswordEmail = sendPasswordEmail;
// src/mail/password-email.helper.ts
const mail_1 = __importDefault(require("@sendgrid/mail"));
mail_1.default.setApiKey(process.env.SENDGRID_API_KEY);
async function sendPasswordEmail(to, tempPassword) {
    const msg = {
        to,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject: 'Your temporary password',
        text: `Your temporary password is ${tempPassword}`,
    };
    await mail_1.default.send(msg);
}
