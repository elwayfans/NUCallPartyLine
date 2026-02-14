import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Find all campaigns
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, completedCalls: true, failedCalls: true, totalContacts: true, vapiAssistantId: true, createdAt: true },
  });
  console.log('=== Campaigns ===');
  for (const c of campaigns) {
    console.log(`${c.name} | status: ${c.status} | completed: ${c.completedCalls} | failed: ${c.failedCalls} | total: ${c.totalContacts} | assistantId: ${c.vapiAssistantId}`);
  }

  // For the first campaign, get campaign contacts
  const campaign = campaigns[0];
  if (campaign) {
    const contacts = await prisma.campaignContact.findMany({
      where: { campaignId: campaign.id },
      include: { contact: true },
    });
    console.log(`\n=== Campaign Contacts for "${campaign.name}" (${contacts.length}) ===`);
    for (const cc of contacts) {
      console.log(`${cc.contact.firstName} ${cc.contact.lastName} | status: ${cc.status} | attempts: ${cc.attempts} | phone: ${cc.contact.phoneNumber} | active: ${cc.contact.isActive}`);
    }

    // Get calls for this campaign
    const calls = await prisma.call.findMany({
      where: { campaignId: campaign.id },
      select: { id: true, status: true, vapiCallId: true, phoneNumber: true, endedReason: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    console.log(`\n=== Calls for campaign (${calls.length}) ===`);
    for (const c of calls) {
      console.log(`${c.id} | status: ${c.status} | vapiId: ${c.vapiCallId} | phone: ${c.phoneNumber} | ended: ${c.endedReason} | ${c.createdAt}`);
    }
  }

  await prisma.$disconnect();
}
main();
