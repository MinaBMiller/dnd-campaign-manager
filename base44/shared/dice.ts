export type RollMode = "normal" | "advantage" | "disadvantage";

export interface RollRequest {
  count: number;
  sides: number;
  modifier?: number;
  mode?: RollMode;
}

export interface RollResult {
  dice_results: number[];
  modifier: number;
  total: number;
  is_critical: boolean;
  is_fumble: boolean;
  mode: RollMode;
}

function secureRandomInt(maxInclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % maxInclusive) + 1;
}

/** Rolls dice using cryptographically secure randomness. Never trust a client-supplied result. */
export function rollDice({ count, sides, modifier = 0, mode = "normal" }: RollRequest): RollResult {
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("Invalid dice count: must be an integer between 1 and 100");
  }
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) {
    throw new Error("Invalid dice sides: must be an integer between 2 and 1000");
  }

  // Advantage/disadvantage only make sense for a single d20 roll.
  if ((mode === "advantage" || mode === "disadvantage") && count === 1 && sides === 20) {
    const rollA = secureRandomInt(20);
    const rollB = secureRandomInt(20);
    const chosen = mode === "advantage" ? Math.max(rollA, rollB) : Math.min(rollA, rollB);
    return {
      dice_results: [rollA, rollB],
      modifier,
      total: chosen + modifier,
      is_critical: chosen === 20,
      is_fumble: chosen === 1,
      mode,
    };
  }

  const dice_results = Array.from({ length: count }, () => secureRandomInt(sides));
  const sum = dice_results.reduce((a, b) => a + b, 0);
  const is_critical = count === 1 && sides === 20 && dice_results[0] === 20;
  const is_fumble = count === 1 && sides === 20 && dice_results[0] === 1;

  return { dice_results, modifier, total: sum + modifier, is_critical, is_fumble, mode: "normal" };
}

const FORMULA_PATTERN = /^(\d+)d(\d+)([+-]\d+)?$/i;

/** Parses a formula like "1d20+5" or "2d6-1" into its structured parts. */
export function parseFormula(formula: string): { count: number; sides: number; modifier: number } {
  const match = FORMULA_PATTERN.exec(formula.trim());
  if (!match) {
    throw new Error(`Invalid dice formula: "${formula}". Expected a format like "1d20+5".`);
  }
  const [, count, sides, modifier] = match;
  return {
    count: parseInt(count, 10),
    sides: parseInt(sides, 10),
    modifier: modifier ? parseInt(modifier, 10) : 0,
  };
}

/** Convenience: roll directly from a formula string, e.g. rollFormula("1d20+5", "advantage"). */
export function rollFormula(formula: string, mode: RollMode = "normal"): RollResult {
  const { count, sides, modifier } = parseFormula(formula);
  return rollDice({ count, sides, modifier, mode });
}
