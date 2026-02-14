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

  if (!logUrl) {
    console.log('No logUrl found');
    await prisma.$disconnect();
    return;
  }

  console.log('Fetching:', logUrl);
  const resp = await fetch(logUrl);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const text = gunzipSync(buffer).toString('utf-8');
  const lines = text.split('\n');
  console.log(`Total lines: ${lines.length}\n`);

  // Show the LAST 80 lines (end-of-call events) in full
  console.log('=== LAST 80 LINES OF CALL LOG ===');
  for (const line of lines.slice(-80)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      console.log(`[${new Date(parsed.time).toISOString()}] ${parsed.body}`);
      // Show attributes for anything related to analysis, end-of-call, or errors
      const body = (parsed.body || '').toLowerCase();
      if (body.includes('analysis') || body.includes('end-of-call') || body.includes('error') || body.includes('hang') || body.includes('ended') || body.includes('disconnect')) {
        console.log('  ATTRS:', JSON.stringify(parsed.attributes, null, 2));
      }
    } catch {
      console.log(line.substring(0, 500));
    }
  }

  // Also specifically find any lines with "analysis" in body
  console.log('\n\n=== LINES WITH "analysis" IN BODY ===');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if ((parsed.body || '').toLowerCase().includes('analysis')) {
        console.log(`[${new Date(parsed.time).toISOString()}] ${parsed.body}`);
        console.log('  FULL:', JSON.stringify(parsed, null, 2).substring(0, 1000));
      }
    } catch {}
  }

  // Also find any error-level lines
  console.log('\n\n=== ERROR-LEVEL LINES (level >= 40) ===');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.level >= 40) {
        console.log(`[${new Date(parsed.time).toISOString()}] LEVEL=${parsed.level} ${parsed.body}`);
        console.log('  ATTRS:', JSON.stringify(parsed.attributes, null, 2).substring(0, 1000));
      }
    } catch {}
  }

  await prisma.$disconnect();
}

main();
