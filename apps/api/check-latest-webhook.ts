import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Get the most recent call from the DB
  const call = await prisma.call.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!call) {
    console.log('No calls found in the database.');
    await prisma.$disconnect();
    return;
  }

  console.log('=== Most Recent Call ===');
  console.log('Call ID:', call.id);
  console.log('VAPI Call ID:', call.vapiCallId);
  console.log('Status:', call.status);
  console.log('Phone:', call.phoneNumber);
  console.log('Created:', call.createdAt);

  // 6. Print vapiAssistantId to check if inline config or assistant ID was used
  console.log('\n=== Assistant Config Check ===');
  console.log('vapiAssistantId (from DB):', call.vapiAssistantId);
  // If vapiAssistantId looks like a VAPI UUID (starts with a hex pattern), it's a VAPI assistant ID.
  // If it looks like a cuid (e.g. starts with "c"), it's a local assistant ID (inline config was used).
  const isVapiUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(call.vapiAssistantId);
  const isCuid = /^c[a-z0-9]{20,}$/i.test(call.vapiAssistantId);
  if (isVapiUUID) {
    console.log('  -> This looks like a VAPI assistant UUID => call used a VAPI assistant ID (not inline config)');
  } else if (isCuid) {
    console.log('  -> This looks like a local cuid => call used INLINE assistant config (getCallConfig)');
  } else {
    console.log('  -> Format unclear. Value:', call.vapiAssistantId);
  }

  // 2. Find the end-of-call-report webhook for that call
  if (!call.vapiCallId) {
    console.log('\nNo vapiCallId on this call — cannot look up webhooks.');
    await prisma.$disconnect();
    return;
  }

  const webhook = await prisma.webhookLog.findFirst({
    where: {
      vapiCallId: call.vapiCallId,
      eventType: 'end-of-call-report',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!webhook) {
    console.log('\nNo end-of-call-report webhook found for vapiCallId:', call.vapiCallId);

    // Show what webhooks DO exist for this call
    const allWebhooks = await prisma.webhookLog.findMany({
      where: { vapiCallId: call.vapiCallId },
      orderBy: { createdAt: 'asc' },
      select: { eventType: true, createdAt: true },
    });
    if (allWebhooks.length > 0) {
      console.log('Webhooks that DO exist for this call:');
      for (const w of allWebhooks) {
        console.log('  ', w.eventType, '|', w.createdAt);
      }
    } else {
      console.log('No webhooks at all for this call.');
    }

    await prisma.$disconnect();
    return;
  }

  const payload = webhook.payload as any;
  const msg = payload?.message;

  // 3. Print the FULL message.analysis object
  console.log('\n=== message.analysis (FULL) ===');
  console.log(JSON.stringify(msg?.analysis, null, 2));

  // 4. Print the FULL message.artifact keys
  console.log('\n=== message.artifact keys ===');
  if (msg?.artifact) {
    console.log(Object.keys(msg.artifact));
  } else {
    console.log('No artifact in message');
  }

  // 5. Print message.artifact.summary if it exists
  console.log('\n=== message.artifact.summary ===');
  if (msg?.artifact?.summary !== undefined) {
    console.log(msg.artifact.summary);
  } else {
    console.log('(no artifact.summary)');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
