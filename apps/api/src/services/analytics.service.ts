import OpenAI from 'openai';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import type { SentimentScore } from '@prisma/client';

interface AnalysisResult {
  sentiment: SentimentScore;
  confidence: number;
  breakdown: { positive: number; negative: number; neutral: number };
  responses: Record<string, string>;
  topics: string[];
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

      await prisma.callAnalytics.upsert({
        where: { callId },
        create: {
          callId,
          overallSentiment: analysis.sentiment,
          sentimentConfidence: analysis.confidence,
          sentimentBreakdown: analysis.breakdown,
          extractedResponses: analysis.responses,
          keyTopics: analysis.topics,
          processedAt: new Date(),
        },
        update: {
          overallSentiment: analysis.sentiment,
          sentimentConfidence: analysis.confidence,
          sentimentBreakdown: analysis.breakdown,
          extractedResponses: analysis.responses,
          keyTopics: analysis.topics,
          processedAt: new Date(),
          processingError: null,
        },
      });

      console.log(`Analytics processed for call ${callId}`);
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
    const prompt = `Analyze this school call transcript and provide:
1. Overall sentiment (VERY_POSITIVE, POSITIVE, NEUTRAL, NEGATIVE, VERY_NEGATIVE)
2. Confidence score (0-1)
3. Sentiment breakdown percentages (positive, negative, neutral should sum to 100)
4. Key responses to questions asked (extract as question: answer pairs)
5. Main topics discussed

Transcript:
${transcript}

Respond ONLY with valid JSON in this exact format:
{
  "sentiment": "SENTIMENT_VALUE",
  "confidence": 0.85,
  "breakdown": {"positive": 60, "negative": 10, "neutral": 30},
  "responses": {"Will you attend the event?": "Yes, confirmed for 2 people"},
  "topics": ["event attendance", "transportation needs"]
}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content) as AnalysisResult;

    // Validate sentiment value
    const validSentiments: SentimentScore[] = [
      'VERY_POSITIVE',
      'POSITIVE',
      'NEUTRAL',
      'NEGATIVE',
      'VERY_NEGATIVE',
    ];
    if (!validSentiments.includes(parsed.sentiment)) {
      parsed.sentiment = 'NEUTRAL';
    }

    return parsed;
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
