import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface InviteEmailPayload {
  toEmail: string;
  inviterName: string;
  tenantName: string;
  inviteToken: string;
  role: string;
  expiresAt: Date;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
  }

  async sendInviteEmail(payload: InviteEmailPayload): Promise<void> {
    const acceptUrl = `${this.config.get('FRONTEND_URL')}/invites/${payload.inviteToken}/accept`;
    const expiryDate = payload.expiresAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    try {
      await this.resend.emails.send({
        from: this.config.get<string>('MAIL_FROM') ?? 'onboarding@resend.dev',
        to: payload.toEmail,
        subject: `You've been invited to join ${payload.tenantName}`,
        html: this.buildInviteTemplate({ ...payload, acceptUrl, expiryDate }),
      });
      this.logger.log(`Invite email sent to ${payload.toEmail}`);
    } catch (error) {
      this.logger.error(
        `Failed to send invite email to ${payload.toEmail}`,
        error,
      );
    }
  }

  private buildInviteTemplate(data: {
    toEmail: string;
    inviterName: string;
    tenantName: string;
    role: string;
    acceptUrl: string;
    expiryDate: string;
  }): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>You're invited</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:32px 40px;">
              <p style="margin:0;font-size:20px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">
                ${data.tenantName}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:600;color:#18181b;letter-spacing:-0.4px;">
                You've been invited
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#71717a;line-height:1.6;">
                <strong style="color:#18181b;">${data.inviterName}</strong> has invited you to join
                <strong style="color:#18181b;">${data.tenantName}</strong> as a
                <strong style="color:#18181b;">${data.role.toLowerCase()}</strong>.
              </p>

              <!-- Role badge -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background-color:#f4f4f5;border-radius:6px;padding:12px 16px;">
                    <p style="margin:0;font-size:13px;color:#71717a;">Your role</p>
                    <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#18181b;text-transform:capitalize;">
                      ${data.role.toLowerCase()}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background-color:#18181b;border-radius:8px;">
                    <a href="${data.acceptUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;letter-spacing:-0.1px;">
                      Accept invitation
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="margin:0 0 8px;font-size:13px;color:#71717a;">
                Or copy this link into your browser:
              </p>
              <p style="margin:0 0 32px;font-size:12px;color:#a1a1aa;word-break:break-all;">
                ${data.acceptUrl}
              </p>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="border-top:1px solid #f4f4f5;"></td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;">
                This invitation expires on <strong style="color:#71717a;">${data.expiryDate}</strong>.
                If you weren't expecting this email you can safely ignore it.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#fafafa;padding:20px 40px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                Sent by SaaS Starter Kit &mdash; you received this because someone invited you to their workspace.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }
}
