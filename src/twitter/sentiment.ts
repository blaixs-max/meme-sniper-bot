import { SENTIMENT_KEYWORDS } from '../config/constants.js';
import { Tweet, SentimentAnalysis } from '../types/index.js';

export interface SentimentResult {
  score: number; // -1 to 1
  label: 'positive' | 'negative' | 'neutral';
  confidence: number; // 0 to 1
  positiveWords: string[];
  negativeWords: string[];
}

export class SentimentAnalyzer {
  private positiveKeywords: Set<string>;
  private negativeKeywords: Set<string>;

  constructor() {
    this.positiveKeywords = new Set(
      SENTIMENT_KEYWORDS.POSITIVE.map(w => w.toLowerCase())
    );
    this.negativeKeywords = new Set(
      SENTIMENT_KEYWORDS.NEGATIVE.map(w => w.toLowerCase())
    );
  }

  /**
   * Analyze sentiment of a single tweet
   */
  analyzeTweet(tweet: Tweet): SentimentResult {
    const text = tweet.text.toLowerCase();
    const words = text.split(/\s+/);

    const positiveWords: string[] = [];
    const negativeWords: string[] = [];

    for (const word of words) {
      // Clean word (remove punctuation)
      const cleanWord = word.replace(/[^a-z0-9]/gi, '');

      if (this.positiveKeywords.has(cleanWord)) {
        positiveWords.push(cleanWord);
      }
      if (this.negativeKeywords.has(cleanWord)) {
        negativeWords.push(cleanWord);
      }
    }

    // Check for multi-word phrases
    for (const phrase of SENTIMENT_KEYWORDS.POSITIVE) {
      if (phrase.includes(' ') && text.includes(phrase.toLowerCase())) {
        positiveWords.push(phrase);
      }
    }
    for (const phrase of SENTIMENT_KEYWORDS.NEGATIVE) {
      if (phrase.includes(' ') && text.includes(phrase.toLowerCase())) {
        negativeWords.push(phrase);
      }
    }

    // Calculate score
    const positiveCount = positiveWords.length;
    const negativeCount = negativeWords.length;
    const totalSignals = positiveCount + negativeCount;

    let score = 0;
    let confidence = 0;

    if (totalSignals > 0) {
      score = (positiveCount - negativeCount) / totalSignals;
      confidence = Math.min(totalSignals / 5, 1); // Max confidence at 5+ signals
    }

    // Adjust score based on emoji sentiment (simplified)
    if (text.includes('🚀') || text.includes('🔥') || text.includes('💎')) {
      score = Math.min(score + 0.2, 1);
      confidence = Math.min(confidence + 0.1, 1);
    }
    if (text.includes('💩') || text.includes('🔴') || text.includes('📉')) {
      score = Math.max(score - 0.2, -1);
      confidence = Math.min(confidence + 0.1, 1);
    }

    // Determine label
    let label: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (score > 0.2) label = 'positive';
    else if (score < -0.2) label = 'negative';

    return {
      score,
      label,
      confidence,
      positiveWords: [...new Set(positiveWords)],
      negativeWords: [...new Set(negativeWords)],
    };
  }

  /**
   * Analyze sentiment of multiple tweets
   */
  analyzeTweets(tweets: Tweet[]): SentimentAnalysis {
    if (tweets.length === 0) {
      return {
        positive: 0,
        negative: 0,
        neutral: 0,
        overall: 'neutral',
        hypeScore: 0,
      };
    }

    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    let totalScore = 0;
    let totalEngagement = 0;

    for (const tweet of tweets) {
      const result = this.analyzeTweet(tweet);

      if (result.label === 'positive') positiveCount++;
      else if (result.label === 'negative') negativeCount++;
      else neutralCount++;

      // Weight score by engagement
      const engagement = tweet.metrics.likes + tweet.metrics.retweets * 2 + tweet.metrics.replies;
      totalScore += result.score * (1 + Math.log10(engagement + 1));
      totalEngagement += engagement;
    }

    // Calculate percentages
    const total = tweets.length;
    const positive = Math.round((positiveCount / total) * 100);
    const negative = Math.round((negativeCount / total) * 100);
    const neutral = Math.round((neutralCount / total) * 100);

    // Determine overall sentiment
    let overall: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (positive > negative && positive > 40) overall = 'positive';
    else if (negative > positive && negative > 40) overall = 'negative';

    // Calculate hype score (0-100)
    // Based on volume, sentiment, and engagement
    const volumeScore = Math.min(tweets.length / 2, 30); // Max 30 for 60+ tweets
    const sentimentScore = Math.max(0, totalScore / tweets.length) * 30; // Max 30
    const engagementScore = Math.min(Math.log10(totalEngagement + 1) * 10, 40); // Max 40

    const hypeScore = Math.round(volumeScore + sentimentScore + engagementScore);

    return {
      positive,
      negative,
      neutral,
      overall,
      hypeScore: Math.min(hypeScore, 100),
    };
  }

  /**
   * Add custom positive keyword
   */
  addPositiveKeyword(keyword: string): void {
    this.positiveKeywords.add(keyword.toLowerCase());
  }

  /**
   * Add custom negative keyword
   */
  addNegativeKeyword(keyword: string): void {
    this.negativeKeywords.add(keyword.toLowerCase());
  }

  /**
   * Remove keyword
   */
  removeKeyword(keyword: string): void {
    const lower = keyword.toLowerCase();
    this.positiveKeywords.delete(lower);
    this.negativeKeywords.delete(lower);
  }

  /**
   * Get keyword counts
   */
  getKeywordCounts(): { positive: number; negative: number } {
    return {
      positive: this.positiveKeywords.size,
      negative: this.negativeKeywords.size,
    };
  }
}

// Export singleton instance
export const sentimentAnalyzer = new SentimentAnalyzer();
