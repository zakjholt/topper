import { getByPath } from "./document.ts";

const TOKEN = {
  number: /^[0-9]+(?:\.[0-9]+)?/,
  ident: /^[A-Za-z_][A-Za-z0-9_.]*/,
};

type Parser = {
  src: string;
  i: number;
};

function skipWs(p: Parser) {
  while (p.i < p.src.length && /\s/.test(p.src[p.i]!)) p.i += 1;
}

function consume(p: Parser, re: RegExp): string | null {
  skipWs(p);
  const slice = p.src.slice(p.i);
  const match = re.exec(slice);
  if (!match || match.index !== 0) return null;
  p.i += match[0].length;
  return match[0];
}

function expectChar(p: Parser, ch: string) {
  skipWs(p);
  if (p.src[p.i] !== ch) {
    throw new Error(`Expected '${ch}' in formula`);
  }
  p.i += 1;
}

function parseExpr(p: Parser, data: unknown): number {
  let value = parseTerm(p, data);
  while (true) {
    skipWs(p);
    const op = p.src[p.i];
    if (op !== "+" && op !== "-") break;
    p.i += 1;
    const rhs = parseTerm(p, data);
    value = op === "+" ? value + rhs : value - rhs;
  }
  return value;
}

function parseTerm(p: Parser, data: unknown): number {
  let value = parseUnary(p, data);
  while (true) {
    skipWs(p);
    const op = p.src[p.i];
    if (op !== "*" && op !== "/") break;
    p.i += 1;
    const rhs = parseUnary(p, data);
    value = op === "*" ? value * rhs : rhs === 0 ? 0 : value / rhs;
  }
  return value;
}

function parseUnary(p: Parser, data: unknown): number {
  skipWs(p);
  if (p.src[p.i] === "-") {
    p.i += 1;
    return -parseUnary(p, data);
  }
  if (p.src[p.i] === "+") {
    p.i += 1;
    return parseUnary(p, data);
  }
  return parsePrimary(p, data);
}

function parsePrimary(p: Parser, data: unknown): number {
  const num = consume(p, TOKEN.number);
  if (num) return Number(num);

  const ident = consume(p, TOKEN.ident);
  if (ident) {
    skipWs(p);
    if (p.src[p.i] === "(") {
      p.i += 1;
      const args: number[] = [];
      skipWs(p);
      if (p.src[p.i] !== ")") {
        args.push(parseExpr(p, data));
        skipWs(p);
        while (p.src[p.i] === ",") {
          p.i += 1;
          args.push(parseExpr(p, data));
          skipWs(p);
        }
      }
      expectChar(p, ")");
      return callFn(ident, args);
    }
    const resolved = getByPath(data, ident);
    return typeof resolved === "number" && Number.isFinite(resolved) ? resolved : 0;
  }

  skipWs(p);
  if (p.src[p.i] === "(") {
    p.i += 1;
    const value = parseExpr(p, data);
    expectChar(p, ")");
    return value;
  }

  throw new Error(`Unexpected token in formula: ${p.src.slice(p.i)}`);
}

function callFn(name: string, args: number[]): number {
  switch (name) {
    case "floor":
      return Math.floor(args[0] ?? 0);
    case "ceil":
      return Math.ceil(args[0] ?? 0);
    case "round":
      return Math.round(args[0] ?? 0);
    case "abs":
      return Math.abs(args[0] ?? 0);
    case "min":
      return Math.min(...(args.length ? args : [0]));
    case "max":
      return Math.max(...(args.length ? args : [0]));
    default:
      throw new Error(`Unknown function '${name}'`);
  }
}

export function evaluateFormula(source: string, data: unknown): number {
  const p: Parser = { src: source, i: 0 };
  const value = parseExpr(p, data);
  skipWs(p);
  if (p.i !== p.src.length) {
    throw new Error(`Unexpected trailing input in formula: ${p.src.slice(p.i)}`);
  }
  return Number.isFinite(value) ? value : 0;
}

export function tryEvaluateFormula(source: string, data: unknown): number | null {
  try {
    return evaluateFormula(source, data);
  } catch {
    return null;
  }
}
