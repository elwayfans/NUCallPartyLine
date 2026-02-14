import OpenAI from 'openai';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import type { SentimentScore, CallOutcome } from '@prisma/client';

interface AnalysisResult {
  sentiment: SentimentScore;
  confidence: number;
  breakdown: { positive: number; negative: number; neutral: number };
  responses: Record<string, string>;
  topics: string[];
  summary: string;
  outcome: string;
  outcomeReason: string;
  callResult: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  callResultReason: string;
  appointmentDetails: {
    scheduled: boolean;
    date?: string;
    time?: string;
    location?: string;
    type?: string;
    notes?: string;
  } | null;
  actionItems: string[];
  nextSteps: string[];
}

export class AnalyticsService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  /**
   * Queue a call for analytics processing
   */
  async queueAnalysis(callId: string): Promise<void> {
    // In production, you'd use a job queue (Bull, BullMQ)
    // For now, process in background
    setImmediate(() => {
      this.processCallAnalytics(callId).catch((err) => {
        console.error(`Failed to process analytics for call ${callId}:`, err);
      });
    });
  }

  /**
   * Process analytics for a call
   */
  async processCallAnalytics(callId: string): Promise<void> {
    const transcript = await prisma.transcript.findUnique({
      where: { callId },
      include: { call: { include: { contact: true } } },
    });

    if (!transcript) {
      console.log(`No transcript found for call ${callId}`);
      return;
    }

    try {
      const analysis = await this.analyzeTranscript(transcript.fullText);

      // Read any existing data (e.g., VAPI summary captured by webhook)
      const existing = await prisma.callAnalytics.findUnique({
        where: { callId },
        select: { customFields: true },
      });
      const existingCustom = (existing?.customFields as Record<string, unknown>) ?? {};

      // Build customFields payload
      const customFields = {
        ...existingCustom,
        callResult: analysis.callResult,
        callResultReason: analysis.callResultReason,
        outcomeReason: analysis.outcomeReason,
        appointmentDetails: analysis.appointmentDetails,
        actionItems: analysis.actionItems,
        nextSteps: analysis.nextSteps,
      };

      // Calculate speaker turns from messages
      const messages = transcript.messages as Array<{ role: string }>;
      const speakerTurns = messages?.length ?? 0;

      await prisma.callAnalytics.upsert({
        where: { callId },
        create: {
          callId,
          overallSentiment: analysis.sentiment,
          sentimentConfidence: analysis.confidence,
          sentimentBreakdown: analysis.breakdown,
          extractedResponses: analysis.responses,
          keyTopics: analysis.topics,
          summary: analysis.summary,
          speakerTurns,
          customFields,
          processedAt: new Date(),
        },
        update: {
          overallSentiment: analysis.sentiment,
          sentimentConfidence: analysis.confidence,
          sentimentBreakdown: analysis.breakdown,
          extractedResponses: analysis.responses,
          keyTopics: analysis.topics,
          summary: analysis.summary,
          speakerTurns,
          customFields,
          processedAt: new Date(),
          processingError: null,
        },
      });

      // Set Call.outcome
      const validOutcomes: CallOutcome[] = [
        'SUCCESS', 'PARTIAL', 'NO_RESPONSE', 'CALLBACK_REQUESTED',
        'WRONG_NUMBER', 'DECLINED', 'TECHNICAL_FAILURE',
      ];
      const outcome: CallOutcome = validOutcomes.includes(analysis.outcome as CallOutcome)
        ? (analysis.outcome as CallOutcome)
        : 'PARTIAL';

      await prisma.call.update({
        where: { id: callId },
        data: { outcome },
      });

      console.log(`Analytics processed for call ${callId} - outcome: ${outcome}`);

      // Notify frontend that analytics are ready
      try {
        const { wsService } = await import('../index.js');
        wsService.emitCallAnalyticsReady(callId);
      } catch {
        // wsService may not be available in non-server contexts
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Analytics processing failed for call ${callId}:`, errorMessage);

      await prisma.callAnalytics.upsert({
        where: { callId },
        create: {
          callId,
          processingError: errorMessage,
        },
        update: {
          processingError: errorMessage,
        },
      });
    }
  }

  /**
   * Analyze a transcript using OpenAI
   */
  private async analyzeTranscript(transcript: string): Promise<AnalysisResult> {
    const prompt = `You are analyzing a school-related phone call transcript. Extract the following structured data:

1. **Sentiment Analysis**
   - Overall sentiment: VERY_POSITIVE, POSITIVE, NEUTRAL, NEGATIVE, or VERY_NEGATIVE
   - Confidence score: 0.0 to 1.0
   - Breakdown: percentages for positive, negative, neutral (must sum to 100)

2. **Call Summary**
   - Write a concise 2-3 sentence summary of the call, focusing on what was discussed and any decisions made.

3. **Call Outcome** - Determine the most appropriate outcome:
   - SUCCESS: Call objectives were fully met
   - PARTIAL: Some objectives met but not all
   - NO_RESPONSE: Could not reach the person (voicemail, no pickup)
   - CALLBACK_REQUESTED: The person asked to be called back later
   - WRONG_NUMBER: Number was wrong or person is not the intended contact
   - DECLINED: The person explicitly declined or refused
   - TECHNICAL_FAILURE: Call had technical issues

4. **Call Result (Pass/Fail)**
   - PASS: The call achieved its primary purpose
   - FAIL: The call did not achieve its primary purpose
   - INCONCLUSIVE: Cannot determine from the conversation
   - Provide a brief reason for the classification.

5. **Appointment Details** (if any appointment, meeting, or event was discussed)
   - Was an appointment/meeting scheduled? (true/false)
   - If yes: date, time, location, type of appointment, any notes
   - If no appointment was discussed, return null.

6. **Extracted Responses** - Key question/answer pairs from the conversation.

7. **Key Topics** - Main topics discussed in the call.

8. **Action Items** - Any action items or follow-ups mentioned.

9. **Next Steps** - What happens next after this call.

Transcript:
${transcript}

Respond ONLY with valid JSON in this exact format:
{
  "sentiment": "SENTIMENT_VALUE",
  "confidence": 0.85,
  "breakdown": {"positive": 60, "negative": 10, "neutral": 30},
  "summary": "Two to three sentence summary of the call.",
  "outcome": "SUCCESS",
  "outcomeReason": "Brief explanation of why this outcome was chosen",
  "callResult": "PASS",
  "callResultReason": "Brief explanation of pass/fail determination",
  "appointmentDetails": {
    "scheduled": true,
    "date": "2025-02-15",
    "time": "2:30 PM",
    "location": "Main Office",
    "type": "Parent-teacher conference",
    "notes": "Bring recent report card"
  },
  "responses": {"Will you attend the event?": "Yes, confirmed for 2 people"},
  "topics": ["event attendance", "transportation needs"],
  "actionItems": ["Send confirmation email", "Reserve parking spot"],
  "nextSteps": ["Follow up call in 2 weeks"]
}

If no appointment was discussed, set appointmentDetails to null.
If there are no action items or next steps, use empty arrays.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);

    // Validate sentiment value
    const validSentiments: SentimentScore[] = [
      'VERY_POSITIVE', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'VERY_NEGATIVE',
    ];

    return {
      sentiment: validSentiments.includes(parsed.sentiment) ? parsed.sentiment : 'NEUTRAL',
      confidence: parsed.confidence ?? 0.5,
      breakdown: parsed.breakdown ?? { positive: 33, negative: 33, neutral: 34 },
      responses: parsed.responses ?? {},
      topics: parsed.topics ?? [],
      summary: parsed.summary ?? 'No summary available.',
      outcome: parsed.outcome ?? 'PARTIAL',
      outcomeReason: parsed.outcomeReason ?? '',
      callResult: parsed.callResult ?? 'INCONCLUSIVE',
      callResultReason: parsed.callResultReason ?? '',
      appointmentDetails: parsed.appointmentDetails ?? null,
      actionItems: parsed.actionItems ?? [],
      nextSteps: parsed.nextSteps ?? [],
    };
  }

  /**
   * Get aggregated analytics for a campaign
   */
  async getCampaignAnalytics(campaignId: string) {
    const calls = await prisma.call.findMany({
      where: { campaignId },
      include: { analytics: true },
    });

    const analyticsData = calls
      .filter((c) => c.analytics)
      .map((c) => c.analytics!);

    if (analyticsData.length === 0) {
      return {
        totalCalls: calls.length,
        analyzedCalls: 0,
        sentimentDistribution: {},
        avgSentimentConfidence: 0,
        topTopics: [],
        commonResponses: {},
      };
    }

    // Sentiment distribution
    const sentimentCounts: Record<string, number> = {};
    for (const a of analyticsData) {
      if (a.overallSentiment) {
        sentimentCounts[a.overallSentiment] = (sentimentCounts[a.overallSentiment] ?? 0) + 1;
      }
    }

    // Average confidence
    const avgConfidence =
      analyticsData.reduce((sum, a) => sum + (a.sentimentConfidence ?? 0), 0) /
      analyticsData.length;

    // Top topics
    const topicCounts: Record<string, number> = {};
    for (const a of analyticsData) {
      for (const topic of a.keyTopics) {
        topicCounts[topic] = (topicCounts[topic] ?? 0) + 1;
      }
    }
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count }));

    // Common responses
    const responseCounts: Record<string, Record<string, number>> = {};
    for (const a of analyticsData) {
      const responses = a.extractedResponses as Record<string, string> | null;
      if (responses) {
        for (const [question, answer] of Object.entries(responses)) {
          if (!responseCounts[question]) {
            responseCounts[question] = {};
          }
          responseCounts[question][answer] = (responseCounts[question][answer] ?? 0) + 1;
        }
      }
    }

    return {
      totalCalls: calls.length,
      analyzedCalls: analyticsData.length,
      sentimentDistribution: sentimentCounts,
      avgSentimentConfidence: avgConfidence,
      topTopics,
      commonResponses: responseCounts,
    };
  }

  /**
   * Get dashboard analytics
   */
  async getDashboardStats() {
    const [
      totalCalls,
      callsToday,
      sentimentCounts,
      avgDuration,
    ] = await Promise.all([
      prisma.call.count(),
      prisma.call.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      prisma.callAnalytics.groupBy({
        by: ['overallSentiment'],
        _count: true,
      }),
      prisma.call.aggregate({
        where: { duration: { not: null } },
        _avg: { duration: true },
      }),
    ]);

    // Calculate dominant sentiment
    const sentimentDistribution = Object.fromEntries(
      sentimentCounts.map((s) => [s.overallSentiment ?? 'UNKNOWN', s._count])
    );

    const dominantSentiment = sentimentCounts
      .filter((s) => s.overallSentiment)
      .sort((a, b) => b._count - a._count)[0]?.overallSentiment ?? null;

    return {
      totalCalls,
      callsToday,
      avgDuration: avgDuration._avg.duration ?? 0,
      sentimentDistribution,
      dominantSentiment,
    };
  }

  /**
   * Reprocess analytics for a specific call
   */
  async reprocessAnalytics(callId: string): Promise<void> {
    await this.processCallAnalytics(callId);
  }
}

export const analyticsService = new AnalyticsService();
