import { TwitterApi, TweetV2, UserV2 } from 'twitter-api-v2';
import NodeCache from 'node-cache';
import { twitterConfig } from '../config/settings.js';
import { TWITTER } from '../config/constants.js';
import { twitterLogger as logger } from '../utils/logger.js';

export interface TwitterClientConfig {
  bearerToken?: string;
  apiKey?: string;
  apiSecret?: string;
  rateLimit?: number;
}

export class TwitterClient {
  private client: TwitterApi | null = null;
  private cache: NodeCache;
  private requestCount: number = 0;
  private requestCountResetTime: number = 0;
  private rateLimit: number;
  private isConfigured: boolean = false;

  constructor(config: TwitterClientConfig = {}) {
    this.cache = new NodeCache({
      stdTTL: TWITTER.CACHE_TTL,
      checkperiod: 60,
    });

    this.rateLimit = config.rateLimit || TWITTER.RATE_LIMIT_FREE;
    this.initialize(config);
  }

  /**
   * Initialize Twitter client
   */
  private initialize(config: TwitterClientConfig): void {
    const bearerToken = config.bearerToken || twitterConfig.bearerToken;

    if (!bearerToken) {
      logger.warn('Twitter API not configured - social analysis disabled');
      return;
    }

    try {
      this.client = new TwitterApi(bearerToken);
      this.isConfigured = true;
      this.resetMonthlyCounter();
      logger.info('Twitter client initialized');
    } catch (error) {
      logger.error('Failed to initialize Twitter client', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Check if client is configured and ready
   */
  isReady(): boolean {
    return this.isConfigured && this.client !== null;
  }

  /**
   * Check if we can make a request (rate limiting)
   */
  private canMakeRequest(): boolean {
    this.checkMonthlyReset();
    return this.requestCount < this.rateLimit;
  }

  /**
   * Increment request counter
   */
  private incrementRequestCount(): void {
    this.requestCount++;
    logger.debug('Twitter API request', {
      count: this.requestCount,
      limit: this.rateLimit,
    });
  }

  /**
   * Check and reset monthly counter
   */
  private checkMonthlyReset(): void {
    const now = Date.now();
    if (now >= this.requestCountResetTime) {
      this.resetMonthlyCounter();
    }
  }

  /**
   * Reset monthly counter
   */
  private resetMonthlyCounter(): void {
    this.requestCount = 0;

    // Reset on first day of next month
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    this.requestCountResetTime = nextMonth.getTime();

    logger.debug('Twitter rate limit counter reset', {
      nextReset: nextMonth.toISOString(),
    });
  }

  /**
   * Search recent tweets
   */
  async searchTweets(
    query: string,
    maxResults: number = 100
  ): Promise<TweetV2[]> {
    if (!this.isReady()) {
      logger.warn('Twitter client not ready');
      return [];
    }

    // Check cache first
    const cacheKey = `search:${query}:${maxResults}`;
    const cached = this.cache.get<TweetV2[]>(cacheKey);
    if (cached) {
      logger.debug('Returning cached search results', { query });
      return cached;
    }

    // Check rate limit
    if (!this.canMakeRequest()) {
      logger.warn('Twitter rate limit reached');
      return [];
    }

    try {
      this.incrementRequestCount();

      const result = await this.client!.v2.search(query, {
        max_results: Math.min(maxResults, 100),
        'tweet.fields': ['created_at', 'public_metrics', 'author_id'],
        expansions: ['author_id'],
      });

      const tweets = result.data.data || [];

      // Cache results
      this.cache.set(cacheKey, tweets);

      logger.debug('Search completed', {
        query,
        resultCount: tweets.length,
      });

      return tweets;
    } catch (error) {
      logger.error('Twitter search failed', {
        query,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Get tweet count for a query
   */
  async getTweetCount(query: string): Promise<number> {
    if (!this.isReady()) return 0;

    // Check cache
    const cacheKey = `count:${query}`;
    const cached = this.cache.get<number>(cacheKey);
    if (cached !== undefined) return cached;

    if (!this.canMakeRequest()) {
      logger.warn('Twitter rate limit reached');
      return 0;
    }

    try {
      this.incrementRequestCount();

      const result = await this.client!.v2.tweetCountRecent(query);
      const count = result.meta.total_tweet_count;

      this.cache.set(cacheKey, count);
      return count;
    } catch (error) {
      logger.error('Tweet count failed', {
        query,
        error: (error as Error).message,
      });
      return 0;
    }
  }

  /**
   * Get user by username
   */
  async getUser(username: string): Promise<UserV2 | null> {
    if (!this.isReady()) return null;

    const cacheKey = `user:${username}`;
    const cached = this.cache.get<UserV2>(cacheKey);
    if (cached) return cached;

    if (!this.canMakeRequest()) {
      logger.warn('Twitter rate limit reached');
      return null;
    }

    try {
      this.incrementRequestCount();

      const result = await this.client!.v2.userByUsername(username, {
        'user.fields': ['public_metrics', 'verified', 'description'],
      });

      if (result.data) {
        this.cache.set(cacheKey, result.data);
        return result.data;
      }

      return null;
    } catch (error) {
      logger.error('Get user failed', {
        username,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Get user's recent tweets
   */
  async getUserTweets(
    userId: string,
    maxResults: number = 10
  ): Promise<TweetV2[]> {
    if (!this.isReady()) return [];

    const cacheKey = `userTweets:${userId}:${maxResults}`;
    const cached = this.cache.get<TweetV2[]>(cacheKey);
    if (cached) return cached;

    if (!this.canMakeRequest()) {
      logger.warn('Twitter rate limit reached');
      return [];
    }

    try {
      this.incrementRequestCount();

      const result = await this.client!.v2.userTimeline(userId, {
        max_results: Math.min(maxResults, 100),
        'tweet.fields': ['created_at', 'public_metrics'],
      });

      const tweets = result.data.data || [];
      this.cache.set(cacheKey, tweets);
      return tweets;
    } catch (error) {
      logger.error('Get user tweets failed', {
        userId,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Get remaining API requests
   */
  getRemainingRequests(): number {
    this.checkMonthlyReset();
    return Math.max(0, this.rateLimit - this.requestCount);
  }

  /**
   * Get rate limit info
   */
  getRateLimitInfo(): {
    limit: number;
    used: number;
    remaining: number;
    resetDate: Date;
  } {
    this.checkMonthlyReset();
    return {
      limit: this.rateLimit,
      used: this.requestCount,
      remaining: this.getRemainingRequests(),
      resetDate: new Date(this.requestCountResetTime),
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.flushAll();
    logger.debug('Twitter cache cleared');
  }

  /**
   * Update rate limit (for tier upgrades)
   */
  setRateLimit(limit: number): void {
    this.rateLimit = limit;
    logger.info('Twitter rate limit updated', { limit });
  }
}

// Export singleton instance
export const twitterClient = new TwitterClient();
