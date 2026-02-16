import sgMail from '@sendgrid/mail';
import { env } from '../config/env.js';

// Initialize SendGrid if configured
if (env.SENDGRID_API_KEY) {
  sgMail.setApiKey(env.SENDGRID_API_KEY);
}

const FROM_NAME = 'Neumont University Admissions';

interface AppointmentEmailParams {
  /** Prospect emails — confirmed from call + contact record (deduplicated) */
  prospectEmails?: string[];
  /** Prospect's name */
  prospectName: string;
  /** Comma-separated notification emails (admissions team) */
  notificationEmails: string;
  /** Appointment date (raw from VAPI, e.g. "next Thursday") */
  rawDate?: string;
  /** Appointment time (raw from VAPI, e.g. "9 AM") */
  rawTime?: string;
  /** Appointment type (e.g. "campus tour", "phone call") */
  appointmentType?: string;
  /** Resolved ISO datetime from chrono-node */
  resolvedDateTime?: string | null;
  /** Phone number of the prospect */
  phoneNumber?: string;
  /** Call transcript as structured messages */
  transcriptMessages?: Array<{ role: string; content: string }>;
  /** Call summary from VAPI analysis */
  callSummary?: string;
}

/**
 * Generate an ICS calendar event string.
 */
function generateICS(params: {
  summary: string;
  description: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  organizerEmail: string;
  attendees: string[];
}): string {
  const formatDate = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@nucallpartyline`;

  const attendeeLines = params.attendees
    .map((email) => `ATTENDEE;RSVP=TRUE:mailto:${email}`)
    .join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NUCallPartyLine//Appointment//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatDate(new Date())}`,
    `DTSTART:${formatDate(params.startDate)}`,
    `DTEND:${formatDate(params.endDate)}`,
    `SUMMARY:${params.summary}`,
    `DESCRIPTION:${params.description.replace(/\n/g, '\\n')}`,
    ...(params.location ? [`LOCATION:${params.location}`] : []),
    `ORGANIZER;CN=${FROM_NAME}:mailto:${params.organizerEmail}`,
    ...(attendeeLines ? [attendeeLines] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Parse the notification emails string into an array of trimmed, non-empty emails.
 */
function parseNotificationEmails(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && e.includes('@'));
}

/**
 * Send appointment notification emails with an ICS calendar invite.
 * Sends to the prospect (if email is available) and all notification emails.
 */
export async function sendAppointmentEmail(params: AppointmentEmailParams): Promise<void> {
  if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) {
    console.log('SendGrid not configured — skipping appointment email');
    return;
  }

  const notificationList = parseNotificationEmails(params.notificationEmails);
  const prospectList = (params.prospectEmails ?? []).filter((e) => e.includes('@'));
  if (notificationList.length === 0 && prospectList.length === 0) {
    console.log('No email recipients — skipping appointment email');
    return;
  }

  // Build the appointment date for the subject and body
  let appointmentDate: Date;
  if (params.resolvedDateTime) {
    appointmentDate = new Date(params.resolvedDateTime);
  } else {
    // Fallback: schedule for tomorrow at 10 AM if we couldn't resolve the date
    appointmentDate = new Date();
    appointmentDate.setDate(appointmentDate.getDate() + 1);
    appointmentDate.setHours(10, 0, 0, 0);
  }

  const endDate = new Date(appointmentDate.getTime() + 30 * 60 * 1000); // 30 min duration

  const dateStr = appointmentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = appointmentDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const appointmentTypeLabel = params.appointmentType || 'Admissions Appointment';
  const subject = `Your Neumont University Appointment - ${dateStr}`;

  const description = [
    `Appointment with ${params.prospectName}`,
    `Type: ${appointmentTypeLabel}`,
    `Date: ${dateStr} at ${timeStr}`,
    ...(params.rawDate ? [`(Original: ${params.rawDate}${params.rawTime ? ' at ' + params.rawTime : ''})`] : []),
    ...(params.phoneNumber ? [`Phone: ${params.phoneNumber}`] : []),
  ].join('\n');

  // All recipients for the calendar invite (deduplicated)
  const allRecipients = [...notificationList];
  for (const email of prospectList) {
    if (!allRecipients.includes(email)) {
      allRecipients.push(email);
    }
  }

  const icsContent = generateICS({
    summary: `Neumont University - ${appointmentTypeLabel} with ${params.prospectName}`,
    description,
    startDate: appointmentDate,
    endDate,
    organizerEmail: env.SENDGRID_FROM_EMAIL,
    attendees: allRecipients,
  });

  const icsBase64 = Buffer.from(icsContent).toString('base64');

  // Build transcript HTML if available
  let transcriptHtml = '';
  if (params.transcriptMessages && params.transcriptMessages.length > 0) {
    const messageRows = params.transcriptMessages
      .map((m) => {
        const label = m.role === 'assistant' || m.role === 'bot' ? 'AI' : 'Prospect';
        const bgColor = label === 'AI' ? '#ebf4ff' : '#f0fff4';
        const labelColor = label === 'AI' ? '#2b6cb0' : '#276749';
        return `<div style="margin-bottom: 8px; padding: 8px 12px; background: ${bgColor}; border-radius: 6px;">
          <strong style="color: ${labelColor};">${label}:</strong> ${m.content}
        </div>`;
      })
      .join('');

    transcriptHtml = `
      <div style="margin: 16px 0;">
        <h3 style="color: #1a365d; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Call Transcript</h3>
        <div style="font-size: 0.9em; max-height: 600px; overflow-y: auto;">
          ${messageRows}
        </div>
      </div>
    `;
  }

  // Build call summary section if available
  const summaryHtml = params.callSummary
    ? `<div style="background: #fffff0; border-left: 4px solid #d69e2e; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0;">
        <strong style="color: #744210;">Call Summary:</strong>
        <p style="margin: 4px 0 0 0;">${params.callSummary}</p>
      </div>`
    : '';

  // Build HTML body
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
      <h2 style="color: #1a365d;">Neumont University Appointment Scheduled</h2>
      <div style="background: #f7fafc; border-radius: 8px; padding: 20px; margin: 16px 0;">
        <p><strong>Prospect:</strong> ${params.prospectName}</p>
        ${params.phoneNumber ? `<p><strong>Phone:</strong> ${params.phoneNumber}</p>` : ''}
        ${prospectList.length > 0 ? `<p><strong>Email:</strong> ${prospectList.join(', ')}</p>` : ''}
        <p><strong>Appointment Type:</strong> ${appointmentTypeLabel}</p>
        <p><strong>Date:</strong> ${dateStr}</p>
        <p><strong>Time:</strong> ${timeStr}</p>
        ${params.rawDate ? `<p style="color: #718096; font-size: 0.9em;">(As stated: ${params.rawDate}${params.rawTime ? ' at ' + params.rawTime : ''})</p>` : ''}
      </div>
      ${summaryHtml}
      ${transcriptHtml}
      <p style="color: #718096; font-size: 0.85em;">
        This appointment was scheduled via an automated call through NUCallPartyLine.
        A calendar invite is attached.
      </p>
    </div>
  `;

  // Send to all recipients
  const toEmails = allRecipients.map((email) => ({ email }));

  try {
    await sgMail.send({
      to: toEmails,
      from: { email: env.SENDGRID_FROM_EMAIL, name: FROM_NAME },
      subject,
      html: htmlBody,
      attachments: [
        {
          content: icsBase64,
          filename: 'appointment.ics',
          type: 'application/ics',
          disposition: 'attachment',
        },
      ],
    });

    console.log(`Appointment email sent to ${allRecipients.join(', ')} for ${params.prospectName}`);
  } catch (error) {
    console.error('Failed to send appointment email:', error);
    // Don't throw — email failure shouldn't break the call flow
  }
}
