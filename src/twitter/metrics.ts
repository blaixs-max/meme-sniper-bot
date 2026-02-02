import NodeCache from 'node-cache';
import { twitterSearch } from './search.js';
import { sentimentAnalyzer } from './sentiment.js';
import { twitterClient } from './client.js';
import { twitterLogger as logger } from '../utils/logger.js';
import { TwitterAnalysis, TwitterEngagement, Tweet } from '../types/index.js';

export class TwitterMetricsService {
  private cache: NodeCache;

  constructor() {
    this.cache = new NodeCache({
      stdTTL: 300, // 5 minute cache
      checkperiod: 60,
    });
  }

  /**
   * Get comprehensive Twitter analysis for a token
   */
  async analyzeToken(
    tokenSymbol: string,
    tokenName?: string
  ): Promise<TwitterAnalysis> {
    const cacheKey = `analysis:${tokenSymbol}`;
    const cached = this.cache.get<TwitterAnalysis>(cacheKey);
    if (cached) {
      logger.debug('Returning cached Twitter analysis', { tokenSymbol });
      return cached;
    }

    logger.info('Analyzing Twitter metrics', { tokenSymbol });

    // Get tweets
    const tweets = await twitterSearch.searchToken(tokenSymbol, tokenName, 100);

    if (tweets.length === 0) {
      const emptyAnalysis: TwitterAnalysis = {
        tokenSymbol,
        tweetCount: 0,
        uniqueUsers: 0,
        engagement: { likes: 0, retweets: 0, replies: 0, total: 0 },
        sentiment: {
          positive: 0,
          negative: 0,
          neutral: 100,
          overall: 'neutral',
          hypeScore: 0,
        },
        influencerMentions: 0,
        score: 0,
        lastUpdated: new Date(),
      };

      this.cache.set(cacheKey, emptyAnalysis);
      return emptyAnalysis;
    }

    // Calculate metrics
    const engagement = this.calculateEngagement(tweets);
    const sentiment = sentimentAnalyzer.analyzeTweets(tweets);
    const uniqueUsers = this.countUniqueUsers(tweets);
    const influencerMentions = tweets.filter(t => t.isInfluencer).length;

    // Calculate overall score (0-100)
    const score = this.calculateScore({
      tweetCount: tweets.length,
      uniqueUsers,
      engagement,
      sentiment,
      influencerMentions,
    });

    const analysis: TwitterAnalysis = {
      tokenSymbol,
      tweetCount: tweets.length,
      uniqueUsers,
      engagement,
      sentiment,
      influencerMentions,
      score,
      lastUpdated: new Date(),
    };

    this.cache.set(cacheKey, analysis);

    logger.info('Twitter analysis complete', {
      tokenSymbol,
      score,
      tweetCount: tweets.length,
      sentiment: sentiment.overall,
    });

    return analysis;
  }

  /**
   * Calculate engagement metrics
   */
  private calculateEngagement(tweets: Tweet[]): TwitterEngagement {
    let likes = 0;
    let retweets = 0;
    let replies = 0;

    for (const tweet of tweets) {
      likes += tweet.metrics.likes;
      retweets += tweet.metrics.retweets;
      replies += tweet.metrics.replies;
    }

    return {
      likes,
      retweets,
      replies,
      total: likes + retweets + replies,
    };
  }

  /**
   * Count unique users
   */
  private countUniqueUsers(tweets: Tweet[]): number {
    const userIds = new Set(tweets.map(t => t.authorId));
    return userIds.size;
  }

  /**
   * Calculate overall Twitter score (0-100)
   * Formula: (Tweet Count × 0.2) + (Engagement × 0.3) + (Sentiment × 0.3) + (Influencer × 0.2)
   */
  private calculateScore(metrics: {
    tweetCount: number;
    uniqueUsers: number;
    engagement: TwitterEngagement;
    sentiment: { positive: number; hypeScore: number };
    influencerMentions: number;
  }): number {
    // Tweet count score (max 20 points for 100+ tweets)
    const tweetScore = Math.min(metrics.tweetCount / 5, 20);

    // Engagement score (max 30 points)
    const engagementLog = Math.log10(metrics.engagement.total + 1);
    const engagementScore = Math.min(engagementLog * 10, 30);

    // Sentiment score (max 30 points)
    // Combine positive percentage and hype score
    const sentimentBase = (metrics.sentiment.positive / 100) * 15;
    const hypeBase = (metrics.sentiment.hypeScore / 100) * 15;
    const sentimentScore = sentimentBase + hypeBase;

    // Influencer score (max 20 points)
    const influencerScore = Math.min(metrics.influencerMentions * 5, 20);

    const totalScore = tweetScore + engagementScore + sentimentScore + influencerScore;

    return Math.round(Math.min(totalScore, 100));
  }

  /**
   * Quick check if a token has Twitter presence
   */
  async hasTwitterPresence(tokenSymbol: string): Promise<boolean> {
    const count = await twitterSearch.getTweetCount(tokenSymbol);
    return count > 5; // At least 5 tweets
  }

  /**
   * Get viral potential score
   */
  async getViralPotential(tokenSymbol: string): Promise<number> {
    const analysis = await this.analyzeToken(tokenSymbol);

    // Factors for viral potential:
    // 1. High engagement rate (engagement per tweet)
    // 2. Positive sentiment
    // 3. Growing activity (would need historical data)
    // 4. Influencer involvement

    if (analysis.tweetCount === 0) return 0;

    const engagementRate = analysis.engagement.total / analysis.tweetCount;
    const engagementScore = Math.min(engagementRate / 10, 30);

    const sentimentBonus = analysis.sentiment.positive > 60 ? 20 : 0;
    const influencerBonus = analysis.influencerMentions > 0 ? 20 : 0;
    const volumeBonus = analysis.tweetCount > 50 ? 20 : (analysis.tweetCount / 50) * 20;

    return Math.round(
      Math.min(engagementScore + sentimentBonus + influencerBonus + volumeBonus + 10, 100)
    );
  }

  /**
   * Compare Twitter metrics for multiple tokens
   */
  async compareTokens(
    tokenSymbols: string[]
  ): Promise<Map<string, TwitterAnalysis>> {
    const results = new Map<string, TwitterAnalysis>();

    for (const symbol of tokenSymbols) {
      try {
        const analysis = await this.analyzeToken(symbol);
        results.set(symbol, analysis);
      } catch (error) {
        logger.warn('Could not analyze token', {
          symbol,
          error: (error as Error).message,
        });
      }
    }

    return results;
  }

  /**
   * Get API rate limit status
   */
  getRateLimitStatus(): {
    remaining: number;
    limit: number;
    resetDate: Date;
  } {
    const info = twitterClient.getRateLimitInfo();
    return {
      remaining: info.remaining,
      limit: info.limit,
      resetDate: info.resetDate,
    };
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.cache.flushAll();
    logger.debug('Twitter metrics cache cleared');
  }

  /**
   * Check if Twitter analysis is available
   */
  isAvailable(): boolean {
    return twitterClient.isReady();
  }
}

// Export singleton instance
export const twitterMetrics = new TwitterMetricsService();
