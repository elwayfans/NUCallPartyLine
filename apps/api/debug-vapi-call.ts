import { PrismaClient } from '@prisma/client';
import { VapiClient } from '@vapi-ai/server-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();
const vapi = new VapiClient({ token: process.env.VAPI_API_KEY! });

async function main() {
  // 1. Get logUrl from webhook
  const webhook = await prisma.webhookLog.findFirst({
    where: { 
      vapiCallId: '019c5a53-2ff9-7444-81ff-feadfdab1f0e',
      eventType: 'end-of-call-report'
    },
    select: { payload: true },
  });

  const payload = webhook?.payload as any;
  const logUrl = payload?.message?.artifact?.logUrl;
  console.log('=== Log URL ===');
  console.log(logUrl);

  // 2. Fetch the call directly from VAPI API
  console.log('\n=== VAPI API: Get Call ===');
  try {
    const vapiCall = await vapi.calls.get('019c5a53-2ff9-7444-81ff-feadfdab1f0e');
    
    console.log('Status:', vapiCall.status);
    console.log('EndedReason:', vapiCall.endedReason);
    
    console.log('\n--- analysis ---');
    console.log(JSON.stringify(vapiCall.analysis, null, 2));
    
    console.log('\n--- artifact.summary ---');
    console.log((vapiCall.artifact as any)?.summary ?? 'NOT PRESENT');
    
    // Check if structuredData is populated
    console.log('\n--- analysis.structuredData ---');
    console.log(JSON.stringify(vapiCall.analysis?.structuredData, null, 2));
    
    console.log('\n--- analysis.summary ---');
    console.log(vapiCall.analysis?.summary ?? 'NOT PRESENT');
    
    console.log('\n--- analysis.successEvaluation ---');
    console.log(vapiCall.analysis?.successEvaluation ?? 'NOT PRESENT');

    // Also check the assistant config that was sent
    console.log('\n--- assistant.analysisPlan (what was sent) ---');
    const ap = (vapiCall as any).assistant?.analysisPlan;
    if (ap) {
      console.log('structuredDataPlan.enabled:', ap.structuredDataPlan?.enabled);
      console.log('successEvaluationPlan.enabled:', ap.successEvaluationPlan?.enabled);
      console.log('summaryPlan.enabled:', ap.summaryPlan?.enabled);
      console.log('structuredDataPlan has schema:', !!ap.structuredDataPlan?.schema);
      console.log('structuredDataPlan schema properties:', Object.keys(ap.structuredDataPlan?.schema?.properties ?? {}));
    } else {
      console.log('NO analysisPlan in assistant config');
    }
  } catch (err: any) {
    console.error('VAPI API error:', err.message);
  }

  // 3. If logUrl exists, try to fetch it (handle gzip)
  if (logUrl) {
    console.log('\n=== Fetching VAPI Log URL ===');
    try {
      const resp = await fetch(logUrl);
      const buffer = Buffer.from(await resp.arrayBuffer());
      
      let text: string;
      // Check if it's gzipped (magic bytes 1f 8b)
      if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
        console.log('(Log is gzip compressed, decompressing...)');
        text = gunzipSync(buffer).toString('utf-8');
      } else {
        text = buffer.toString('utf-8');
      }
      
      const lines = text.split('\n');
      console.log(`Total log lines: ${lines.length}`);
      
      const relevantLines = lines.filter((l: string) => 
        l.toLowerCase().includes('analysis') || 
        l.toLowerCase().includes('error') || 
        l.toLowerCase().includes('structured') ||
        l.toLowerCase().includes('summary') ||
        l.toLowerCase().includes('success')
      );
      if (relevantLines.length > 0) {
        console.log(`\nFound ${relevantLines.length} relevant lines:`);
        for (const line of relevantLines.slice(0, 30)) {
          console.log(line.substring(0, 500));
        }
      } else {
        console.log('No lines mentioning analysis/error/structured/summary. Showing last 30 lines:');
        for (const line of lines.slice(-30)) {
          console.log(line.substring(0, 500));
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch log URL:', err.message);
    }
  }

  await prisma.$disconnect();
}

main();
