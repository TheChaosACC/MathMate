export interface MathResult {
  readonly value: string;
  readonly detail: string;
}

export type AngleUnit = "degrees" | "radians";

interface LinearValue {
  readonly coefficient: number;
  readonly constant: number;
}

type Token =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "name"; readonly value: string }
  | { readonly kind: "operator"; readonly value: string };

const SYMBOLS: Readonly<Record<string, string>> = {
  "\\pi": "π",
  "\\tau": "τ",
  "\\Delta": "Δ",
  "\\Sigma": "Σ",
  "\\Pi": "Π",
  "\\Omega": "Ω",
  "\\alpha": "α",
  "\\beta": "β",
  "\\gamma": "γ",
  "\\theta": "θ",
  "\\lambda": "λ",
  "\\mu": "μ",
  "\\sigma": "σ",
  "\\phi": "φ",
  "\\omega": "ω",
  "\\infty": "∞",
  "\\times": "×",
  "\\cdot": "·",
  "\\le": "≤",
  "\\leq": "≤",
  "\\ge": "≥",
  "\\geq": "≥",
  "\\neq": "≠",
  "\\pm": "±",
  "\\sum": "∑",
  "\\prod": "∏",
  "\\int": "∫",
  "\\oint": "∮",
  "\\partial": "∂",
  "\\nabla": "∇",
  "\\forall": "∀",
  "\\exists": "∃",
  "\\in": "∈",
  "\\notin": "∉",
  "\\subset": "⊂",
  "\\subseteq": "⊆",
  "\\supset": "⊃",
  "\\supseteq": "⊇",
  "\\cup": "∪",
  "\\cap": "∩",
  "\\emptyset": "∅",
  "\\approx": "≈",
  "\\equiv": "≡",
  "\\propto": "∝",
  "\\to": "→",
  "\\rightarrow": "→",
  "\\leftarrow": "←",
  "\\Rightarrow": "⇒",
  "\\Leftrightarrow": "⇔",
  "\\therefore": "∴",
  "\\because": "∵",
  "\\degree": "°"
};

const FUNCTIONS: Readonly<Record<string, (value: number) => number>> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  arcsin: Math.asin,
  acos: Math.acos,
  arccos: Math.acos,
  atan: Math.atan,
  arctan: Math.atan,
  ln: Math.log,
  log: Math.log10,
  abs: Math.abs,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil
};

export function replaceMathSymbolSuffix(text: string, inMath: boolean): string | undefined {
  if (!inMath) return undefined;
  for (const [command, symbol] of Object.entries(SYMBOLS).sort(([left], [right]) => right.length - left.length)) {
    if (text.endsWith(command)) {
      return symbol;
    }
  }
  if (inMath && /(?:^|[^\p{L}])pi$/u.test(text)) {
    return "π";
  }
  return undefined;
}

export function normalizeVariableName(name: string): string {
  return normalizeMath(name).trim();
}

export function calculateMath(
  source: string,
  angleUnit: AngleUnit = "degrees",
  answer?: string,
  variables: Readonly<Record<string, number>> = {}
): MathResult | undefined {
  let normalized = normalizeMath(source);
  if (/\bans\b/i.test(normalized)) {
    if (answer === undefined) return undefined;
    normalized = normalized.replace(/\bans\b/gi, `(${normalizeMath(answer)})`);
  }
  if (!normalized || normalized.length > 300) {
    return undefined;
  }

  const equalParts = normalized.split("=");
  if (equalParts.length > 2 || equalParts.some((part) => part.trim() === "")) {
    return undefined;
  }

  try {
    if (!normalized.includes("=") && /(?:^|[^\p{L}])i(?:$|[^\p{L}])/u.test(normalized)) {
      const complex = new ComplexParser(normalized).parse();
      return { value: formatComplex(complex), detail: "Calculated" };
    }
    if (equalParts.length === 2) {
      return solveEquation(equalParts[0], equalParts[1], angleUnit, variables);
    }
    const result = new Parser(normalized, angleUnit, variables).parse();
    if (result.coefficient !== 0) {
      return undefined;
    }
    return { value: formatNumber(result.constant), detail: "Calculated" };
  } catch {
    return undefined;
  }
}

export function toLatex(source: string): string {
  let value = source.trim();
  const protectedFractions: string[] = [];
  value = protectLatexFractions(value, protectedFractions);
  value = value.replace(/^\$+|\$+$/g, "");
  value = value.replace(/^\\\(|\\\)$/g, "");
  value = value.replace(/^\\\[|\\\]$/g, "");
  value = value.replace(/\\(sqrt|sin|cos|tan|asin|arcsin|acos|arccos|atan|arctan|ln|log|abs|exp|floor|ceil)\b/g, "$1");
  value = value.replace(/\b(sqrt|sin|cos|tan|asin|acos|atan|ln|log|abs|exp|floor|ceil)\s*\{([^{}]*)\}/g, "$1($2)");
  value = value.replace(/⁻¹/g, "^-1");
  const protectedScripts: string[] = [];
  value = value.replace(/([_^])\{([^{}]*)\}/g, (_match, operator: string, content: string) => {
    const placeholder = `\uE100${protectedScripts.length}\uE101`;
    protectedScripts.push(`${operator}{${content}}`);
    return placeholder;
  });
  value = value.replaceAll("{", "(").replaceAll("}", ")");
  value = value.replace(/\b(sin|cos|tan)\s*\^\s*\(?\s*-1\s*\)?\s*\(/g, (_match, name: string) => `${name === "sin" ? "asin" : name === "cos" ? "acos" : "atan"}(`);
  value = value.replace(/\bipi\b/gi, "iπ");
  value = value.replace(/\bi(sin|cos|tan)\s*\(/gi, "i*$1(");
  for (const [command, symbol] of Object.entries(SYMBOLS).sort(([left], [right]) => right.length - left.length)) {
    value = value.replaceAll(command, symbol);
  }

  const latexSymbols: Readonly<Record<string, string>> = {
    "π": "\\pi", "τ": "\\tau", "Δ": "\\Delta", "Σ": "\\Sigma", "Π": "\\Pi", "Ω": "\\Omega",
    "α": "\\alpha", "β": "\\beta", "γ": "\\gamma",
    "θ": "\\theta", "λ": "\\lambda", "μ": "\\mu", "σ": "\\sigma", "φ": "\\phi",
    "ω": "\\omega", "∞": "\\infty", "×": "\\times", "·": "\\cdot",
    "≤": "\\leq", "≥": "\\geq", "≠": "\\neq", "±": "\\pm",
    "∑": "\\sum", "∏": "\\prod", "∫": "\\int", "∮": "\\oint", "∂": "\\partial", "∇": "\\nabla",
    "∀": "\\forall", "∃": "\\exists", "∈": "\\in", "∉": "\\notin", "⊂": "\\subset", "⊆": "\\subseteq",
    "⊃": "\\supset", "⊇": "\\supseteq", "∪": "\\cup", "∩": "\\cap", "∅": "\\emptyset",
    "≈": "\\approx", "≡": "\\equiv", "∝": "\\propto", "→": "\\to", "←": "\\leftarrow",
    "⇒": "\\Rightarrow", "⇔": "\\Leftrightarrow", "∴": "\\therefore", "∵": "\\because", "°": "\\degree"
  };
  for (const [symbol, command] of Object.entries(latexSymbols)) {
    value = value.replaceAll(symbol, command);
  }

  value = value.replace(/(?<!\\)\bpi\b/g, "\\pi").replace(/(?<!\\)\btau\b/g, "\\tau").replace(/(?<!\\)\b(alpha|beta|gamma|theta|lambda|mu|sigma|phi|omega)\b/g, "\\$1");
  value = value.replace(/(?<=\d),(?=\d)/g, "{,}");
  value = value.replace(/\s*\*\s*/g, " \\cdot ");
  value = value.replace(/(\\[a-zA-Z]+|[a-zA-Z]+|\d+(?:\.\d+)?)\s*\/\s*(\\[a-zA-Z]+|[a-zA-Z]+|\d+(?:\.\d+)?)/g, "\\frac{$1}{$2}");
  value = formatPowers(formatFunctionCalls(value));
  value = value.replace(/\uE100(\d+)\uE101/g, (_match, index: string) => protectedScripts[Number(index)] ?? _match);
  value = value.replace(/i\s*\\cdot\s*(?=\\(?:sin|cos|tan)\\left)/g, "i");
  return value.replace(/\uE000(\d+)\uE001/g, (_match, index: string) => protectedFractions[Number(index)] ?? _match);
}

function protectLatexFractions(source: string, fractions: string[]): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const command = source.slice(index).match(/^\\(?:dfrac|tfrac|frac)\b/);
    if (!command) {
      output += source[index++];
      continue;
    }

    let groupStart = index + command[0].length;
    while (/\s/.test(source[groupStart] ?? "")) groupStart += 1;
    const numerator = readLatexGroup(source, groupStart);
    if (!numerator) {
      output += source[index++];
      continue;
    }
    groupStart = numerator.end;
    while (/\s/.test(source[groupStart] ?? "")) groupStart += 1;
    const denominator = readLatexGroup(source, groupStart);
    if (!denominator) {
      output += source[index++];
      continue;
    }

    const formatted = `\\frac{${toLatex(numerator.value)}}{${toLatex(denominator.value)}}`;
    const placeholder = `\uE000${fractions.length}\uE001`;
    fractions.push(formatted);
    output += placeholder;
    index = denominator.end;
  }
  return output;
}

function readLatexGroup(source: string, start: number): { readonly value: string; readonly end: number } | undefined {
  if (source[start] !== "{") return undefined;
  let depth = 1;
  let index = start + 1;
  while (index < source.length && depth > 0) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    index += 1;
  }
  if (depth !== 0) return undefined;
  return { value: source.slice(start + 1, index - 1), end: index };
}

function formatPowers(source: string): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    if (source[index] !== "^") {
      output += source[index++];
      continue;
    }

    output += "^";
    index += 1;
    const compactImaginaryExponent = source.slice(index).match(/^i(?:\s*\\cdot\s*|)\\pi/);
    if (compactImaginaryExponent) {
      output += `{${compactImaginaryExponent[0].replace(/\s*\\cdot\s*/, "")}}`;
      index += compactImaginaryExponent[0].length;
      continue;
    }
    if (source[index] === "(") {
      let depth = 1;
      const start = index + 1;
      let end = start;
      while (end < source.length && depth > 0) {
        if (source[end] === "(") depth += 1;
        if (source[end] === ")") depth -= 1;
        end += 1;
      }
      if (depth === 0) {
        output += `{${formatPowers(source.slice(start, end - 1))}}`;
        index = end;
        continue;
      }
    }

    const start = index;
    if (source[index] === "+" || source[index] === "-") index += 1;
    while (index < source.length && /[\p{L}\p{N}.]/u.test(source[index])) index += 1;
    output += `{${source.slice(start, index)}}`;
  }
  return output;
}

function formatFunctionCalls(source: string): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const nameMatch = source.slice(index).match(/^[a-zA-Z]+/);
    if (!nameMatch) {
      output += source[index];
      index += 1;
      continue;
    }

    const name = nameMatch[0].toLowerCase();
    const afterName = index + nameMatch[0].length;
    let openIndex = afterName;
    while (/\s/.test(source[openIndex] ?? "")) openIndex += 1;
    if (!FUNCTIONS[name] || source[openIndex] !== "(") {
      output += nameMatch[0];
      index = afterName;
      continue;
    }

    let depth = 1;
    let closeIndex = openIndex + 1;
    while (closeIndex < source.length && depth > 0) {
      if (source[closeIndex] === "(") depth += 1;
      if (source[closeIndex] === ")") depth -= 1;
      closeIndex += 1;
    }
    if (depth !== 0) {
      output += nameMatch[0];
      index = afterName;
      continue;
    }

    const argument = formatFunctionCalls(source.slice(openIndex + 1, closeIndex - 1));
    switch (name) {
      case "sqrt": output += `\\sqrt{${argument}}`; break;
      case "asin": output += `\\arcsin\\left(${argument}\\right)`; break;
      case "acos": output += `\\arccos\\left(${argument}\\right)`; break;
      case "atan": output += `\\arctan\\left(${argument}\\right)`; break;
      case "abs": output += `\\left|${argument}\\right|`; break;
      case "exp": output += `e^{${argument}}`; break;
      case "floor": output += `\\left\\lfloor${argument}\\right\\rfloor`; break;
      case "ceil": output += `\\left\\lceil${argument}\\right\\rceil`; break;
      default: output += `\\${name}\\left(${argument}\\right)`;
    }
    index = closeIndex;
  }
  return output;
}

function normalizeMath(source: string): string {
  let value = source.trim();
  value = value.replace(/^\$+|\$+$/g, "");
  value = value.replace(/^\\\(|\\\)$/g, "");
  value = value.replace(/^\\\[|\\\]$/g, "");
  value = value.replace(/\\left|\\right/g, "");
  value = value.replace(/\\(sqrt|sin|cos|tan|asin|arcsin|acos|arccos|atan|arctan|ln|log|abs|exp|floor|ceil)\b/g, "$1");
  value = replaceLatexFractions(value);
  value = value.replace(/(?<=\d)\{,\}(?=\d)/g, ".");
  value = value.replaceAll("{", "(").replaceAll("}", ")");
  value = value.replace(/⁻¹/g, "^-1");
  value = value.replace(/\b(sin|cos|tan)\s*\^\s*\(?\s*-1\s*\)?\s*\(/g, (_match, name: string) => `${name === "sin" ? "asin" : name === "cos" ? "acos" : "atan"}(`);
  value = value.replace(/\barcsin\b/g, "asin").replace(/\barccos\b/g, "acos").replace(/\barctan\b/g, "atan");
  value = value.replace(/(?<=\d),(?=\d)/g, ".");
  for (const [command, symbol] of Object.entries(SYMBOLS).sort(([left], [right]) => right.length - left.length)) {
    value = value.replaceAll(command, symbol);
  }
  return value.replaceAll("×", "*").replaceAll("·", "*").replaceAll("÷", "/");
}

function replaceLatexFractions(source: string): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const command = source.slice(index).match(/^\\(?:dfrac|tfrac|frac)\b/);
    if (!command) {
      output += source[index++];
      continue;
    }

    let groupStart = index + command[0].length;
    while (/\s/.test(source[groupStart] ?? "")) groupStart += 1;
    const numerator = readLatexGroup(source, groupStart);
    if (!numerator) {
      output += source[index++];
      continue;
    }
    groupStart = numerator.end;
    while (/\s/.test(source[groupStart] ?? "")) groupStart += 1;
    const denominator = readLatexGroup(source, groupStart);
    if (!denominator) {
      output += source[index++];
      continue;
    }

    output += `(${replaceLatexFractions(numerator.value)})/(${replaceLatexFractions(denominator.value)})`;
    index = denominator.end;
  }
  return output;
}

function solveEquation(
  leftSource: string,
  rightSource: string,
  angleUnit: AngleUnit,
  variables: Readonly<Record<string, number>>
): MathResult {
  const leftVariableMatch = leftSource.trim().match(/^(\\[a-zA-Z]+|[\p{L}]+)$/u);
  const leftVariableName = leftVariableMatch ? normalizeVariableName(leftVariableMatch[1]) : undefined;
  const leftVariables = leftVariableName
    ? Object.fromEntries(Object.entries(variables).filter(([name]) => name !== leftVariableName))
    : variables;
  const leftParser = new Parser(leftSource, angleUnit, leftVariables);
  const rightParser = new Parser(rightSource, angleUnit, variables);
  const left = leftParser.parse();
  const right = rightParser.parse();
  const coefficient = left.coefficient - right.coefficient;
  const constant = right.constant - left.constant;
  const leftVariable = leftParser.variableName;
  const rightVariable = rightParser.variableName;
  if (leftVariable && rightVariable && leftVariable !== rightVariable) {
    throw new Error("Only one variable can be solved at a time");
  }

  if (Math.abs(coefficient) < 1e-12) {
    if (Math.abs(constant) < 1e-12) {
      return { value: "All values", detail: "Identity" };
    }
    return { value: "No solution", detail: "Contradiction" };
  }

  const variable = leftVariable ?? rightVariable ?? "x";
  return {
    value: `${variable} = ${formatNumber(constant / coefficient)}`,
    detail: "Solved"
  };
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("The result is not finite");
  }
  const rounded = Number(value.toPrecision(12));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function factorial(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 170) {
    throw new Error("Factorial requires an integer from 0 to 170");
  }
  let result = 1;
  for (let factor = 2; factor <= value; factor += 1) result *= factor;
  return result;
}

function evaluateFunction(name: string, value: number, angleUnit: AngleUnit): number {
  const toRadians = (angle: number): number => angleUnit === "degrees" ? angle * Math.PI / 180 : angle;
  const fromRadians = (angle: number): number => angleUnit === "degrees" ? angle * 180 / Math.PI : angle;
  switch (name) {
    case "sin": return Math.sin(toRadians(value));
    case "cos": return Math.cos(toRadians(value));
    case "tan": return Math.tan(toRadians(value));
    case "asin":
    case "arcsin": return fromRadians(Math.asin(value));
    case "acos":
    case "arccos": return fromRadians(Math.acos(value));
    case "atan":
    case "arctan": return fromRadians(Math.atan(value));
    default: return FUNCTIONS[name](value);
  }
}

interface ComplexNumber {
  readonly real: number;
  readonly imaginary: number;
}

class ComplexParser {
  private readonly tokens: Token[];
  private position = 0;

  constructor(source: string) {
    this.tokens = addImplicitMultiplication(tokenize(source));
  }

  parse(): ComplexNumber {
    const value = this.parseAddition();
    if (this.position !== this.tokens.length) throw new Error("Unexpected token");
    return value;
  }

  private parseAddition(): ComplexNumber {
    let value = this.parseMultiplication();
    while (this.match("+") || this.match("-")) {
      const operator = this.previous().value;
      const right = this.parseMultiplication();
      value = complexAdd(value, operator === "+" ? right : complexScale(right, -1));
    }
    return value;
  }

  private parseMultiplication(): ComplexNumber {
    let value = this.parseUnary();
    while (this.match("*") || this.match("/")) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      value = operator === "*" ? complexMultiply(value, right) : complexDivide(value, right);
    }
    return value;
  }

  private parseUnary(): ComplexNumber {
    if (this.match("+")) return this.parseUnary();
    if (this.match("-")) return complexScale(this.parseUnary(), -1);
    return this.parsePower();
  }

  private parsePower(): ComplexNumber {
    let base = this.parsePrimary();
    while (this.match("!")) {
      if (base.imaginary !== 0) throw new Error("Factorial requires a real integer");
      base = { real: factorial(base.real), imaginary: 0 };
    }
    if (!this.match("^")) return base;
    return complexPower(base, this.parseUnary());
  }

  private parsePrimary(): ComplexNumber {
    if (this.match("(")) {
      const value = this.parseAddition();
      if (!this.match(")")) throw new Error("Missing closing parenthesis");
      return value;
    }

    const token = this.tokens[this.position];
    if (!token) throw new Error("Expected a value");
    this.position += 1;
    if (token.kind === "number") return { real: token.value, imaginary: 0 };
    if (token.kind !== "name") throw new Error("Expected a number or complex constant");

    switch (token.value.toLowerCase()) {
      case "i": return { real: 0, imaginary: 1 };
      case "e": return { real: Math.E, imaginary: 0 };
      case "pi":
      case "π": return { real: Math.PI, imaginary: 0 };
      case "tau":
      case "τ": return { real: Math.PI * 2, imaginary: 0 };
      default: throw new Error("Unsupported complex variable");
    }
  }

  private match(value: string): boolean {
    if (this.tokens[this.position]?.kind === "operator" && this.tokens[this.position].value === value) {
      this.position += 1;
      return true;
    }
    return false;
  }

  private previous(): { readonly kind: "operator"; readonly value: string } {
    return this.tokens[this.position - 1] as { readonly kind: "operator"; readonly value: string };
  }
}

function complexAdd(left: ComplexNumber, right: ComplexNumber): ComplexNumber {
  return { real: left.real + right.real, imaginary: left.imaginary + right.imaginary };
}

function complexScale(value: ComplexNumber, factor: number): ComplexNumber {
  return { real: value.real * factor, imaginary: value.imaginary * factor };
}

function complexMultiply(left: ComplexNumber, right: ComplexNumber): ComplexNumber {
  return {
    real: left.real * right.real - left.imaginary * right.imaginary,
    imaginary: left.real * right.imaginary + left.imaginary * right.real
  };
}

function complexDivide(left: ComplexNumber, right: ComplexNumber): ComplexNumber {
  const denominator = right.real ** 2 + right.imaginary ** 2;
  if (denominator === 0) throw new Error("Cannot divide by zero");
  return {
    real: (left.real * right.real + left.imaginary * right.imaginary) / denominator,
    imaginary: (left.imaginary * right.real - left.real * right.imaginary) / denominator
  };
}

function complexPower(base: ComplexNumber, exponent: ComplexNumber): ComplexNumber {
  const magnitude = Math.hypot(base.real, base.imaginary);
  if (magnitude === 0) {
    if (exponent.real > 0 && exponent.imaginary === 0) return { real: 0, imaginary: 0 };
    throw new Error("Undefined zero power");
  }
  const angle = Math.atan2(base.imaginary, base.real);
  const logBase = { real: Math.log(magnitude), imaginary: angle };
  const product = complexMultiply(logBase, exponent);
  const scale = Math.exp(product.real);
  return { real: scale * Math.cos(product.imaginary), imaginary: scale * Math.sin(product.imaginary) };
}

function formatComplex(value: ComplexNumber): string {
  const real = Math.abs(value.real) < 1e-10 ? 0 : Number(value.real.toPrecision(12));
  const imaginary = Math.abs(value.imaginary) < 1e-10 ? 0 : Number(value.imaginary.toPrecision(12));
  if (imaginary === 0) return formatNumber(real);
  if (real === 0) {
    if (imaginary === 1) return "i";
    if (imaginary === -1) return "-i";
    return `${formatNumber(imaginary)}i`;
  }
  const sign = imaginary < 0 ? " - " : " + ";
  const magnitude = Math.abs(imaginary);
  return `${formatNumber(real)}${sign}${magnitude === 1 ? "" : formatNumber(magnitude)}i`;
}

class Parser {
  private readonly tokens: Token[];
  private position = 0;
  private currentVariable: string | undefined;

  constructor(
    source: string,
    private readonly angleUnit: AngleUnit,
    private readonly variables: Readonly<Record<string, number>> = {}
  ) {
    this.tokens = addImplicitMultiplication(tokenize(source));
  }

  get variableName(): string | undefined {
    return this.currentVariable;
  }

  parse(): LinearValue {
    const value = this.parseAddition();
    if (this.position !== this.tokens.length) {
      throw new Error("Unexpected token");
    }
    return value;
  }

  private parseAddition(): LinearValue {
    let value = this.parseMultiplication();
    while (this.match("+") || this.match("-")) {
      const operator = this.previous().value;
      const right = this.parseMultiplication();
      value = operator === "+" ? add(value, right) : add(value, scale(right, -1));
    }
    return value;
  }

  private parseMultiplication(): LinearValue {
    let value = this.parseUnary();
    while (this.match("*") || this.match("/")) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      value = operator === "*" ? multiply(value, right) : divide(value, right);
    }
    return value;
  }

  private parseUnary(): LinearValue {
    if (this.match("+")) {
      return this.parseUnary();
    }
    if (this.match("-")) {
      return scale(this.parseUnary(), -1);
    }
    return this.parsePower();
  }

  private parsePower(): LinearValue {
    let base = this.parsePrimary();
    while (this.match("!")) {
      if (base.coefficient !== 0) throw new Error("Factorial of a variable is unsupported");
      base = { coefficient: 0, constant: factorial(base.constant) };
    }
    if (!this.match("^")) {
      return base;
    }
    const exponent = this.parseUnary();
    if (exponent.coefficient !== 0) {
      throw new Error("Variable exponents are unsupported");
    }
    if (base.coefficient !== 0) {
      if (exponent.constant === 1) return base;
      if (exponent.constant === 0) return { coefficient: 0, constant: 1 };
      throw new Error("Non-linear equations are unsupported");
    }
    return { coefficient: 0, constant: base.constant ** exponent.constant };
  }

  private parsePrimary(): LinearValue {
    if (this.match("(")) {
      const value = this.parseAddition();
      if (!this.match(")")) throw new Error("Missing closing parenthesis");
      return value;
    }

    const token = this.tokens[this.position];
    if (!token) throw new Error("Expected a value");
    this.position += 1;

    if (token.kind === "number") {
      return { coefficient: 0, constant: token.value };
    }
    if (token.kind === "name") {
      const name = token.value.toLowerCase();
      if (name === "pi" || name === "π") return { coefficient: 0, constant: Math.PI };
      if (name === "e") return { coefficient: 0, constant: Math.E };
      if (name === "tau" || name === "τ") return { coefficient: 0, constant: Math.PI * 2 };
      if (Object.prototype.hasOwnProperty.call(this.variables, token.value)) {
        return { coefficient: 0, constant: this.variables[token.value] };
      }
      if (Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) {
        if (!this.match("(")) throw new Error("Function calls need parentheses");
        const argument = this.parseAddition();
        if (!this.match(")") || argument.coefficient !== 0) {
          throw new Error("Functions of variables are not supported");
        }
        return { coefficient: 0, constant: evaluateFunction(name, argument.constant, this.angleUnit) };
      }
      if (this.currentVariable && this.currentVariable !== token.value) {
        throw new Error("Only one variable can be solved at a time");
      }
      this.currentVariable = token.value;
      return { coefficient: 1, constant: 0 };
    }
    throw new Error("Expected a number or variable");
  }

  private match(value: string): boolean {
    if (this.tokens[this.position]?.kind === "operator" && this.tokens[this.position].value === value) {
      this.position += 1;
      return true;
    }
    return false;
  }

  private previous(): { readonly kind: "operator"; readonly value: string } {
    return this.tokens[this.position - 1] as { readonly kind: "operator"; readonly value: string };
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const number = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const name = source.slice(index).match(/^[\p{L}πτ]+/u);
    if (name) {
      tokens.push({ kind: "name", value: name[0] });
      index += name[0].length;
      continue;
    }
    if ("+-*/^()!".includes(char)) {
      tokens.push({ kind: "operator", value: char });
      index += 1;
      continue;
    }
    throw new Error("Unsupported character");
  }
  return tokens;
}

function addImplicitMultiplication(tokens: Token[]): Token[] {
  const result: Token[] = [];
  for (const token of tokens) {
    const previous = result[result.length - 1];
    const previousEndsValue = previous?.kind === "number" || previous?.kind === "name" || (previous?.kind === "operator" && previous.value === ")");
    const currentStartsValue = token.kind === "number" || token.kind === "name" || (token.kind === "operator" && token.value === "(");
    const isFunctionCall = previous?.kind === "name" && token.kind === "operator" && token.value === "(" && FUNCTIONS[previous.value.toLowerCase()] !== undefined;
    if (previousEndsValue && currentStartsValue && !isFunctionCall) {
      result.push({ kind: "operator", value: "*" });
    }
    result.push(token);
  }
  return result;
}

function add(left: LinearValue, right: LinearValue): LinearValue {
  return { coefficient: left.coefficient + right.coefficient, constant: left.constant + right.constant };
}

function scale(value: LinearValue, factor: number): LinearValue {
  return { coefficient: value.coefficient * factor, constant: value.constant * factor };
}

function multiply(left: LinearValue, right: LinearValue): LinearValue {
  if (left.coefficient !== 0 && right.coefficient !== 0) {
    throw new Error("Non-linear equations are unsupported");
  }
  return {
    coefficient: left.coefficient * right.constant + right.coefficient * left.constant,
    constant: left.constant * right.constant
  };
}

function divide(left: LinearValue, right: LinearValue): LinearValue {
  if (right.coefficient !== 0 || right.constant === 0) {
    throw new Error("Cannot divide by a variable or zero");
  }
  return scale(left, 1 / right.constant);
}
