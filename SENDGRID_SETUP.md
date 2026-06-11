# SendGrid Email Integration Setup Guide

## Overview

FlowOps now includes SendGrid integration for automated email notifications. When users submit a demo request, the system will:

1. **Send a notification email** to the FlowOps team (FlowOps2@proton.me) with all demo request details
2. **Send a confirmation email** to the user confirming their request was received

## Prerequisites

- SendGrid account (free tier available at https://sendgrid.com)
- SendGrid API Key
- Valid sender email address (verified in SendGrid)

## Step-by-Step Setup

### 1. Create a SendGrid Account

1. Visit https://sendgrid.com
2. Sign up for a free account
3. Complete email verification
4. Accept the terms of service

### 2. Generate API Key

1. Log in to SendGrid Dashboard
2. Navigate to **Settings** → **API Keys**
3. Click **Create API Key**
4. Enter a name (e.g., "FlowOps Demo Notifications")
5. Select **Restricted Access**
6. Under **Mail Send**, enable:
   - `mail.send` (Full Access)
7. Click **Create & Verify**
8. Copy the API key (you won't see it again!)

### 3. Verify Sender Email

1. In SendGrid Dashboard, go to **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender**
3. Enter sender details:
   - **From Email Address**: `noreply@flowops.com` (or your domain)
   - **From Name**: `FlowOps`
   - **Reply To Email**: `FlowOps2@proton.me`
4. Click **Create**
5. Check your email for verification link
6. Click the verification link to confirm

**Note**: If you don't have a custom domain, you can use SendGrid's verification email temporarily for testing.

### 4. Configure Environment Variables

Edit `/home/ubuntu/flowops/backend/.env`:

```env
# SendGrid Configuration
SENDGRID_API_KEY="your-actual-sendgrid-api-key"
SENDGRID_FROM_EMAIL="noreply@flowops.com"
SENDGRID_TO_EMAIL="FlowOps2@proton.me"
```

Replace:
- `your-actual-sendgrid-api-key` with your SendGrid API key
- `noreply@flowops.com` with your verified sender email
- `FlowOps2@proton.me` with the email to receive demo notifications

### 5. Test the Integration

#### Option A: Using the Demo Form

1. Start the FlowOps application
2. Navigate to the Demo Request page (`/demo`)
3. Fill out the form with test data
4. Submit the form
5. Check both:
   - Your email (should receive confirmation)
   - FlowOps2@proton.me (should receive notification)

#### Option B: Using curl

```bash
curl -X POST http://localhost:4000/demo/request \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test User",
    "email": "test@example.com",
    "companyName": "Test Company",
    "phoneNumber": "+27 123 456 7890",
    "companySize": "51-200",
    "message": "This is a test demo request"
  }'
```

## Email Templates

### Demo Request Notification (to FlowOps Team)

The notification email includes:
- Requester's full name, email, and phone
- Company name and size
- Custom message from the requester
- Formatted HTML with action prompts

### Confirmation Email (to User)

The confirmation email includes:
- Thank you message
- Links to documentation and pricing
- Expected follow-up timeframe (24 hours)

## Troubleshooting

### Emails Not Sending

**Check 1: API Key Configuration**
```bash
# Verify the API key is set in .env
grep SENDGRID_API_KEY /home/ubuntu/flowops/backend/.env
```

**Check 2: Backend Logs**
```bash
# Look for SendGrid errors in backend logs
# The service logs warnings if SendGrid is not configured
```

**Check 3: SendGrid Dashboard**
1. Log in to SendGrid
2. Go to **Mail Send** → **Logs**
3. Check for failed sends
4. Look for error messages

### Common Issues

| Issue | Solution |
|-------|----------|
| "Invalid email" error | Ensure sender email is verified in SendGrid |
| "Unauthorized" error | Check API key is correct and has mail.send permission |
| Emails going to spam | Add SPF and DKIM records (see SendGrid docs) |
| Rate limiting | Free tier has limits; upgrade plan if needed |

## Production Deployment

### Before Going Live

1. **Upgrade SendGrid Plan**: Free tier has sending limits
   - Free: 100 emails/day
   - Recommended: Paid plan for unlimited

2. **Set Up Domain Authentication**:
   - Add SPF and DKIM records to your domain
   - Improves email deliverability
   - Follow SendGrid's domain authentication guide

3. **Enable Event Tracking** (Optional):
   - Track opens, clicks, bounces
   - Useful for analytics

4. **Set Up Webhooks** (Optional):
   - Receive real-time delivery notifications
   - Update demo request status automatically

### Scaling Considerations

- **Multiple Recipients**: Modify `SENDGRID_TO_EMAIL` to include multiple addresses
- **Dynamic Sender**: Update `SENDGRID_FROM_EMAIL` based on environment
- **Custom Templates**: Use SendGrid's template feature for advanced formatting

## API Reference

### EmailService Methods

#### `sendDemoRequestNotification(data)`

Sends notification email to FlowOps team.

**Parameters:**
```typescript
{
  fullName: string;
  email: string;
  companyName: string;
  phoneNumber?: string;
  companySize: string;
  message?: string;
}
```

**Returns:** `Promise<boolean>`

#### `sendDemoConfirmationEmail(userEmail, userName)`

Sends confirmation email to user.

**Parameters:**
- `userEmail: string` - User's email address
- `userName: string` - User's full name

**Returns:** `Promise<boolean>`

## Fallback Behavior

If SendGrid is not configured or API key is invalid:

1. Demo requests are still saved to the database
2. Errors are logged but don't prevent form submission
3. Users see success message (graceful degradation)
4. Admin can manually follow up on requests

This ensures the application remains functional even without email service.

## Support

For SendGrid issues:
- SendGrid Support: https://support.sendgrid.com
- SendGrid Docs: https://docs.sendgrid.com

For FlowOps integration issues:
- Email: FlowOps2@proton.me
- Check backend logs for detailed error messages

## Next Steps

1. ✅ Set up SendGrid account and API key
2. ✅ Configure environment variables
3. ✅ Test email functionality
4. ✅ Monitor SendGrid dashboard for delivery status
5. 📋 (Optional) Set up domain authentication for production
6. 📋 (Optional) Configure webhooks for advanced tracking
