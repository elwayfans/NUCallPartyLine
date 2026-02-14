import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function main() {
  const webhook = await prisma.webhookLog.findFirst({
    where: { 
      vapiCallId: '019c5a53-2ff9-7444-81ff-feadfdab1f0e',
      eventType: 'end-of-call-report'
    },
    select: { payload: true },
  });

  const payload = webhook?.payload as any;
  const logUrl = payload?.message?.artifact?.logUrl;

  const resp = await fetch(logUrl);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const text = gunzipSync(buffer).toString('utf-8');
  const lines = text.split('\n');

  // Show ONLY the error-level (50) lines with full details
  console.log('=== ALL LEVEL 50 ERROR LINES (FULL) ===\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.level >= 50) {
        console.log(`[${new Date(parsed.time).toISOString()}] ${parsed.body}`);
        console.log(JSON.stringify(parsed.attributes, null, 2));
        console.log('---');
      }
    } catch {}
  }

  // Also show the Analysis request lines
  console.log('\n\n=== ANALYSIS REQUEST LINES (FULL) ===\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if ((parsed.body || '').includes('Analysis')) {
        console.log(`[${new Date(parsed.time).toISOString()}] ${parsed.body}`);
        console.log(JSON.stringify(parsed.attributes, null, 2));
        console.log('---');
      }
    } catch {}
  }

  await prisma.$disconnect();
}

main();
