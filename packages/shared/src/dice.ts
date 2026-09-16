export type DiceRollResult = {
  expression: string;
  count: number;
  sides: number;
  modifier: number;
  dice: number[];
  total: number;
};

const DICE_RE = /^\s*(\d*)\s*[dD]\s*(\d+)\s*([+-]\s*\d+)?\s*$/;

export function parseDiceExpression(expression: string): { count: number; sides: number; modifier: number } {
  const match = DICE_RE.exec(expression);
  if (!match) {
    throw new Error(`Cannot parse dice expression '${expression}'. Try NdS+K, e.g. 2d6+3 or d20.`);
  }
  const count = match[1] ? Number(match[1]) : 1;
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[3].replace(/\s+/g, "")) : 0;
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("Dice count must be between 1 and 100");
  }
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) {
    throw new Error("Die size must be between 2 and 1000");
  }
  return { count, sides, modifier };
}

export function rollDice(expression: string, random: () => number = Math.random): DiceRollResult {
  const { count, sides, modifier } = parseDiceExpression(expression);
  const dice = Array.from({ length: count }, () => 1 + Math.floor(random() * sides));
  const total = dice.reduce((sum, n) => sum + n, 0) + modifier;
  return {
    expression: expression.trim(),
    count,
    sides,
    modifier,
    dice,
    total,
  };
}
