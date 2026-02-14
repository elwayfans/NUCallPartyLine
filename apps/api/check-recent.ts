import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const calls = await prisma.call.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, status: true, vapiCallId: true, createdAt: true, phoneNumber: true },
  });
  console.log('=== Recent 5 calls ===');
  for (const c of calls) {
    console.log(c.id, '|', c.status, '|', c.vapiCallId, '|', c.createdAt);
  }

  // Get all webhooks for the most recent call
  const latestCall = calls[0];
  if (latestCall?.vapiCallId) {
    const webhooks = await prisma.webhookLog.findMany({
      where: { vapiCallId: latestCall.vapiCallId },
      orderBy: { createdAt: 'asc' },
      select: { eventType: true, vapiCallId: true, createdAt: true, error: true, payload: true },
    });
    console.log(`\n=== All webhooks for ${latestCall.vapiCallId} (${webhooks.length} total) ===`);
    for (const w of webhooks) {
      const p = w.payload as any;
      const msg = p?.message;
      const callStatus = msg?.call?.status;
      console.log(w.eventType, '|', callStatus ?? '', '|', w.createdAt, '|', w.error ?? '');
    }
  }

  await prisma.$disconnect();
}

main();
