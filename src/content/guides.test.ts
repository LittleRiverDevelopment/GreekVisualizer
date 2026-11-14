import { describe, expect, it } from 'vitest';
import { losingTradeStory, timeDecayRows, volatilityRows } from './guides';
import { DEFAULT_EXPLORER } from '../scenario/model';

describe('guided scenarios', () => {
  it('shows a computed loss after a favorable spot move', () => {
    const story = losingTradeStory();
    expect(story.after.S).toBeGreaterThan(story.entry.S);
    expect(story.directionalPerShare).toBeGreaterThan(0);
    expect(story.pnlPerShare).toBeLessThan(0);
    expect(story.after.days).toBeLessThan(story.entry.days);
    expect(story.after.sigma).toBeLessThan(story.entry.sigma);
  });

  it('prices shorter-dated at-the-money options below longer-dated ones, volatility fixed', () => {
    const rows = timeDecayRows({ ...DEFAULT_EXPLORER, S: 100, K: 100, sigma: 0.2, right: 'call' }, [60, 30, 7, 1]);
    const prices = rows.map((row) => row.price);
    const first = prices[0] ?? 0;
    const second = prices[1] ?? 0;
    const third = prices[2] ?? 0;
    const fourth = prices[3] ?? 0;
    expect(first).toBeGreaterThan(second);
    expect(second).toBeGreaterThan(third);
    expect(third).toBeGreaterThan(fourth);
    expect(rows.every((row) => row.thetaPerDay !== null)).toBe(true);
  });

  it('raises the call price across the volatility ladder', () => {
    const rows = volatilityRows(DEFAULT_EXPLORER, [0.1, 0.2, 0.4, 0.6]);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]?.price ?? 0).toBeGreaterThan(rows[i - 1]?.price ?? 0);
    }
  });
});
