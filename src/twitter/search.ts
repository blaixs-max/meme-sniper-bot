import { TweetV2 } from 'twitter-api-v2';
import { twitterClient } from './client.js';
import { twitterLogger as logger } from '../utils/logger.js';
import { Tweet } from '../types/index.js';

// Hashtags to include in searches
const CRYPTO_HASHTAGS = ['#BNB', '#BSC', '#FOUR', '#FourMeme', '#Meme'];

export class TwitterSearchService {
  private influencerIds: Set<string> = new Set();

  /**
   * Search for tweets about a token
   */
  async searchToken(
    tokenSymbol: string,
    tokenName?: string,
    maxResults: number = 100
  ): Promise<Tweet[]> {
    if (!twitterClient.isReady()) {
      logger.debug('Twitter client not ready');
      return [];
    }

    // Build search query
    const queries: string[] = [];

    // Search by symbol (with $ prefix for cashtag)
    queries.push(`$${tokenSymbol}`);

    // Search by symbol without $
    queries.push(tokenSymbol);

    // Search by name if provided
    if (tokenName && tokenName !== tokenSymbol) {
      queries.push(`"${tokenName}"`);
    }

    // Add crypto context
    const query = `(${queries.join(' OR ')}) (crypto OR token OR coin OR BNB OR BSC) -is:retweet`;

    logger.debug('Searching Twitter', { query, tokenSymbol });

    try {
      const tweets = await twitterClient.searchTweets(query, maxResults);
      return this.transformTweets(tweets);
    } catch (error) {
      logger.error('Token search failed', {
        tokenSymbol,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Search for hashtag mentions
   */
  async searchHashtags(
    hashtags: string[],
    maxResults: number = 50
  ): Promise<Tweet[]> {
    if (!twitterClient.isReady()) return [];

    const hashtagQuery = hashtags.map(h =>
      h.startsWith('#') ? h : `#${h}`
    ).join(' OR ');

    const query = `(${hashtagQuery}) -is:retweet`;

    try {
      const tweets = await twitterClient.searchTweets(query, maxResults);
      return this.transformTweets(tweets);
    } catch (error) {
      logger.error('Hashtag search failed', {
        hashtags,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Search for token mentions by influencers
   */
  async searchInfluencerMentions(
    tokenSymbol: string,
    maxResults: number = 50
  ): Promise<Tweet[]> {
    // Filter from regular search results
    const allTweets = await this.searchToken(tokenSymbol, undefined, maxResults * 2);

    return allTweets.filter(tweet => tweet.isInfluencer);
  }

  /**
   * Get tweet count for a token in last 7 days
   */
  async getTweetCount(tokenSymbol: string): Promise<number> {
    if (!twitterClient.isReady()) return 0;

    const query = `($${tokenSymbol} OR ${tokenSymbol}) (crypto OR token) -is:retweet`;

    try {
      return await twitterClient.getTweetCount(query);
    } catch (error) {
      logger.error('Get tweet count failed', {
        tokenSymbol,
        error: (error as Error).message,
      });
      return 0;
    }
  }

  /**
   * Get trending tokens from crypto hashtags
   */
  async getTrendingTokens(limit: number = 10): Promise<Map<string, number>> {
    const tweets = await this.searchHashtags(CRYPTO_HASHTAGS, 200);

    // Extract potential token symbols from tweets
    const tokenMentions = new Map<string, number>();

    for (const tweet of tweets) {
      // Find cashtags ($SYMBOL)
      const cashtags = tweet.text.match(/\$[A-Z]{2,10}/gi) || [];

      for (const tag of cashtags) {
        const symbol = tag.slice(1).toUpperCase();
        // Exclude common non-token symbols
        if (!['BNB', 'BTC', 'ETH', 'USD', 'USDT', 'BUSD'].includes(symbol)) {
          tokenMentions.set(symbol, (tokenMentions.get(symbol) || 0) + 1);
        }
      }
    }

    // Sort by mention count and return top N
    const sorted = Array.from(tokenMentions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return new Map(sorted);
  }

  /**
   * Transform Twitter API tweets to our format
   */
  private transformTweets(tweets: TweetV2[]): Tweet[] {
    return tweets.map(tweet => ({
      id: tweet.id,
      text: tweet.text,
      authorId: tweet.author_id || '',
      createdAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
      metrics: {
        likes: tweet.public_metrics?.like_count || 0,
        retweets: tweet.public_metrics?.retweet_count || 0,
        replies: tweet.public_metrics?.reply_count || 0,
      },
      isInfluencer: this.influencerIds.has(tweet.author_id || ''),
    }));
  }

  /**
   * Add influencer ID to track
   */
  addInfluencer(userId: string): void {
    this.influencerIds.add(userId);
  }

  /**
   * Remove influencer ID
   */
  removeInfluencer(userId: string): void {
    this.influencerIds.delete(userId);
  }

  /**
   * Set influencer IDs from usernames
   */
  async setInfluencersFromUsernames(usernames: string[]): Promise<void> {
    this.influencerIds.clear();

    for (const username of usernames) {
      try {
        const user = await twitterClient.getUser(username);
        if (user) {
          this.influencerIds.add(user.id);
          logger.debug('Added influencer', { username, id: user.id });
        }
      } catch (error) {
        logger.warn('Could not find influencer', { username });
      }
    }

    logger.info('Influencers configured', { count: this.influencerIds.size });
  }

  /**
   * Get current influencer count
   */
  getInfluencerCount(): number {
    return this.influencerIds.size;
  }
}

// Export singleton instance
export const twitterSearch = new TwitterSearchService();
