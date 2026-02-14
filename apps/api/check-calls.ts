import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get most recent completed call
  const call = await prisma.call.findFirst({
    where: { status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
    include: { analytics: true, transcript: true },
  });

  if (!call) {
    console.log('No completed calls found');
    await prisma.$disconnect();
    return;
  }

  console.log('=== Call ===');
  console.log('ID:', call.id);
  console.log('Status:', call.status, '| Outcome:', call.outcome);
  console.log('Duration:', call.duration, '| Cost:', call.cost);
  console.log('StartedAt:', call.startedAt, '| EndedAt:', call.endedAt);
  console.log('EndedReason:', call.endedReason);

  if (call.transcript) {
    console.log('\n=== Transcript ===');
    console.log('Full text length:', call.transcript.fullText?.length);
    console.log('Full text (first 500):', call.transcript.fullText?.slice(0, 500));
    console.log('Messages count:', Array.isArray(call.transcript.messages) ? call.transcript.messages.length : 'NOT ARRAY');
    console.log('First 3 messages:', JSON.stringify(call.transcript.messages?.slice(0, 3), null, 2));
    console.log('RecordingUrl:', call.transcript.recordingUrl);
  }

  if (call.analytics) {
    console.log('\n=== Analytics ===');
    console.log('Summary:', call.analytics.summary);
    console.log('Sentiment:', call.analytics.overallSentiment, '| Confidence:', call.analytics.sentimentConfidence);
    console.log('ProcessingError:', call.analytics.processingError);
    console.log('CustomFields:', JSON.stringify(call.analytics.customFields, null, 2));
  }

  // Check the end-of-call-report webhook payload
  console.log('\n=== End-of-call Webhook Payload ===');
  const webhook = await prisma.webhookLog.findFirst({
    where: { vapiCallId: call.vapiCallId ?? undefined, eventType: 'end-of-call-report' },
    orderBy: { createdAt: 'desc' },
  });
  if (webhook) {
    const payload = webhook.payload as any;
    const msg = payload?.message;
    console.log('call.duration:', msg?.call?.duration);
    console.log('call.cost:', msg?.call?.cost);
    console.log('call.status:', msg?.call?.status);
    console.log('call.endedReason:', msg?.call?.endedReason);
    console.log('artifact keys:', msg?.artifact ? Object.keys(msg.artifact) : 'no artifact');
    console.log('artifact.messages (first 2):', JSON.stringify(msg?.artifact?.messages?.slice(0, 2), null, 2));
    console.log('artifact.transcript (first 300):', msg?.artifact?.transcript?.slice(0, 300));
    console.log('artifact.recording:', JSON.stringify(msg?.artifact?.recording));
    console.log('\n--- Analysis (full) ---');
    console.log(JSON.stringify(msg?.analysis, null, 2));
    console.log('\n--- Structured Data ---');
    console.log(JSON.stringify(msg?.analysis?.structuredData, null, 2));
    console.log('\n--- artifact.variables / variableValues ---');
    console.log('variables:', JSON.stringify(msg?.artifact?.variables, null, 2));
    console.log('variableValues:', JSON.stringify(msg?.artifact?.variableValues, null, 2));
  } else {
    console.log('No end-of-call-report webhook found for this call');
  }

  await prisma.$disconnect();
}

main();
