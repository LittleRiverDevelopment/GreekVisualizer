import { describe, expect, it } from 'vitest';
import { defaultModel } from './model';
import { parseScenario, serializeScenario } from './url';

describe('scenario URLs', () => {
  it('round-trips explorer, view, and strategy state', () => {
    const model = defaultModel();
    model.explorer.S = 123.5;
    model.explorer.right = 'put';
    model.explorer.sigma = 0.33;
    model.explorer.r = -0.01;
    model.view.metric = 'vega';
    model.view.axes = 'days-vol';
    model.view.tab = 'strategy';
    model.view.guide = 'gamma-ridge';
    model.strategy.legs = [
      {
        id: 'ignored',
        type: 'option',
        right: 'put',
        strike: 90,
        quantity: -2,
        entryPremium: 1.25,
        multiplier: 50,
      },
      { id: 'stock', type: 'stock', quantity: 10, entryPrice: 88 },
    ];
    const again = parseScenario(serializeScenario(model));
    expect(again.warning).toBeNull();
    expect(again.model.explorer.S).toBe(123.5);
    expect(again.model.explorer.right).toBe('put');
    expect(again.model.explorer.sigma).toBe(0.33);
    expect(again.model.explorer.r).toBe(-0.01);
    expect(again.model.view.metric).toBe('vega');
    expect(again.model.view.axes).toBe('days-vol');
    expect(again.model.view.tab).toBe('strategy');
    expect(again.model.view.guide).toBe('gamma-ridge');
    expect(again.model.strategy.legs).toHaveLength(2);
    const option = again.model.strategy.legs[0];
    expect(option?.type).toBe('option');
    if (option?.type === 'option') {
      expect(option.quantity).toBe(-2);
      expect(option.entryPremium).toBe(1.25);
      expect(option.multiplier).toBe(50);
    }
  });

  it('drops an unsupported version instead of mixing it with defaults silently', () => {
    const parsed = parseScenario('?v=9&S=140&right=put');
    expect(parsed.warning).toMatch(/version/i);
    expect(parsed.model.explorer.S).toBe(100);
    expect(parsed.model.explorer.right).toBe('call');
  });

  it('resets malformed fields and keeps valid ones', () => {
    const parsed = parseScenario('?v=1&S=-5&K=110&sigma=20percent&days=12');
    expect(parsed.warning).toBeTruthy();
    expect(parsed.model.explorer.S).toBe(100);
    expect(parsed.model.explorer.K).toBe(110);
    expect(parsed.model.explorer.days).toBe(12);
    expect(parsed.model.explorer.sigma).toBe(0.2);
  });

  it('reads a decimal volatility and does not treat 0.2 as 20', () => {
    const parsed = parseScenario('?v=1&sigma=0.2');
    expect(parsed.model.explorer.sigma).toBe(0.2);
  });
});
