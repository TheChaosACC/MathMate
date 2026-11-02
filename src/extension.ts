import * as vscode from "vscode";
import { AngleUnit, calculateMath, normalizeVariableName, replaceMathSymbolSuffix, toLatex } from "./mathEngine";

let applyingSymbolEdit = false;
let lastAnswer: string | undefined;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(handleMathSymbolInput),
    vscode.commands.registerCommand("mathmate.calculate", calculateAtCursor),
    vscode.commands.registerCommand("mathmate.finishEquation", finishEquationOnEnter),
    vscode.commands.registerCommand("mathmate.setAnswer", setLastAnswer),
    vscode.languages.registerInlineCompletionItemProvider(
      [{ language: "latex" }, { language: "markdown" }],
      { provideInlineCompletionItems }
    )
  );
}

export function deactivate(): void {}

function handleMathSymbolInput(event: vscode.TextDocumentChangeEvent): void {
  const editor = vscode.window.activeTextEditor;
  if (
    applyingSymbolEdit ||
    !editor ||
    editor.document !== event.document ||
    !["latex", "markdown"].includes(event.document.languageId) ||
    event.contentChanges.length !== 1
  ) {
    return;
  }

  const change = event.contentChanges[0];
  if (change.text.length !== 1 || change.rangeLength !== 0) return;

  const position = event.document.positionAt(change.rangeOffset + change.text.length);
  if (!editor.selection.isEmpty || !editor.selection.active.isEqual(position)) return;

  const linePrefix = event.document.lineAt(position.line).text.slice(0, position.character);
  const inMath = isInsideMath(event.document, position);
  if (change.text === "/" && inMath && replaceSlashWithFraction(editor, position, linePrefix)) {
    return;
  }
  if (!vscode.workspace.getConfiguration("mathmate").get<boolean>("autoReplaceSymbols", true)) return;
  const symbol = replaceMathSymbolSuffix(linePrefix, inMath);
  if (!symbol) return;

  const replaceLength = symbolInputLength(linePrefix, inMath);
  const start = event.document.positionAt(change.rangeOffset + change.text.length - replaceLength);
  applyingSymbolEdit = true;
  void editor.edit((builder) => builder.replace(new vscode.Range(start, position), symbol)).then(
    () => { applyingSymbolEdit = false; },
    () => { applyingSymbolEdit = false; }
  );
}

function replaceSlashWithFraction(
  editor: vscode.TextEditor,
  position: vscode.Position,
  linePrefix: string
): boolean {
  const prefix = linePrefix.slice(0, -1);
  const numeratorStart = findNumeratorStart(prefix);
  if (numeratorStart < 0) return false;

  const numerator = prefix.slice(numeratorStart).trim();
  if (!numerator || /[+\-*/^]$/.test(numerator)) return false;

  const start = new vscode.Position(position.line, numeratorStart);
  const fraction = `\\frac{${numerator}}{}`;
  const denominatorPosition = new vscode.Position(start.line, start.character + `\\frac{${numerator}}{`.length);
  applyingSymbolEdit = true;
  void editor.edit((builder) => builder.replace(new vscode.Range(start, position), fraction)).then(
    (applied) => {
      applyingSymbolEdit = false;
      if (applied) editor.selection = new vscode.Selection(denominatorPosition, denominatorPosition);
    },
    () => { applyingSymbolEdit = false; }
  );
  return true;
}

function findNumeratorStart(prefix: string): number {
  let end = prefix.length;
  while (end > 0 && /\s/.test(prefix[end - 1])) end -= 1;
  let start = previousAtomStart(prefix, end);
  if (start < 0) return -1;

  // Keep contiguous implicit products like 2x together, and explicit products like 2*pi.
  while (start > 0) {
    let operatorIndex = start - 1;
    while (operatorIndex >= 0 && /\s/.test(prefix[operatorIndex])) operatorIndex -= 1;
    if (operatorIndex >= 0 && /[*×·]/.test(prefix[operatorIndex])) {
      const previousStart = previousAtomStart(prefix, operatorIndex);
      if (previousStart < 0) break;
      start = previousStart;
      continue;
    }
    if (operatorIndex >= 0 && /[\p{L}\p{N}πτ]/u.test(prefix[operatorIndex]) && /[\p{L}\p{N}πτ]/u.test(prefix[start])) {
      const previousStart = previousAtomStart(prefix, start);
      if (previousStart < 0 || previousStart === start) break;
      start = previousStart;
      continue;
    }
    break;
  }
  return start;
}

function previousAtomStart(source: string, end: number): number {
  while (end > 0 && /\s/.test(source[end - 1])) end -= 1;
  if (end === 0) return -1;

  const last = source[end - 1];
  if (last === ")" || last === "}") {
    const opening = last === ")" ? "(" : "{";
    let depth = 1;
    let index = end - 2;
    while (index >= 0 && depth > 0) {
      if (source[index] === last) depth += 1;
      if (source[index] === opening) depth -= 1;
      index -= 1;
    }
    if (depth !== 0) return -1;
    let start = index + 1;
    const functionName = source.slice(0, start).match(/(?:\\[a-zA-Z]+|[a-zA-Z]+)\s*$/);
    if (functionName) start -= functionName[0].length;
    return start;
  }

  const atom = source.slice(0, end).match(/(?:\\[a-zA-Z]+|[\p{L}πτ]+|(?:\d+(?:\.\d*)?|\.\d+))$/u);
  if (!atom) return -1;
  return end - atom[0].length;
}

function symbolInputLength(linePrefix: string, inMath: boolean): number {
  const command = linePrefix.match(/\\[a-zA-Z]+$/);
  if (command && inMath) return command[0].length;
  return inMath && /(?:^|[^\p{L}])pi$/u.test(linePrefix) ? 2 : 0;
}

function isInsideMath(document: vscode.TextDocument, position: vscode.Position): boolean {
  const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const withoutEscaped = prefix.replace(/\\\$/g, "");
  const dollarCount = (withoutEscaped.match(/\$/g) ?? []).length;
  if (dollarCount % 2 === 1) return true;

  const countOpen = (open: RegExp, close: RegExp): boolean => {
    let depth = 0;
    for (const match of prefix.matchAll(open)) depth += 1;
    for (const match of prefix.matchAll(close)) depth -= 1;
    return depth > 0;
  };
  if (countOpen(/\\\(/g, /\\\)/g) || countOpen(/\\\[/g, /\\\]/g)) return true;

  const environments = ["math", "displaymath", "equation", "equation*", "align", "align*", "gather", "gather*"];
  return environments.some((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\\\begin\\s*\\{${escaped}\\}(?![\\s\\S]*\\\\end\\s*\\{${escaped}\\})`).test(prefix);
  });
}

interface MathLine {
  readonly expression: string;
  readonly insertPosition: vscode.Position;
  readonly replacementRange: vscode.Range;
  readonly closingDelimiter: string;
  readonly mathMode: boolean;
}

function getMathLine(editor: vscode.TextEditor, useSelection: boolean, allowCaretBeforeFractionClose = false): MathLine | undefined {
  const document = editor.document;
  if (useSelection && !editor.selection.isEmpty) {
    const expression = document.getText(editor.selection).trim();
    if (!expression) return undefined;
    const selectionEnd = editor.selection.end;
    return {
      expression,
      insertPosition: selectionEnd,
      replacementRange: new vscode.Range(selectionEnd, selectionEnd),
      closingDelimiter: "",
      mathMode: isInsideMath(document, editor.selection.start)
    };
  }

  const position = editor.selection.active;
  const line = document.lineAt(position.line);
  const before = line.text.slice(0, position.character);
  const after = line.text.slice(position.character);

  for (const [open, close] of [["\\[", "\\]"], ["\\(", "\\)"], ["$$", "$$"], ["$", "$"]] as const) {
    if (before.startsWith(open) && after.startsWith(close)) {
      const expression = before.slice(open.length).trim();
      if (!expression) return undefined;
      return {
        expression,
        insertPosition: position,
        replacementRange: new vscode.Range(position, position),
        closingDelimiter: "",
        mathMode: true
      };
    }
  }

  if (position.character !== line.text.length) {
    const trailingFractionClose = /^\}+(?:\s*(?:\$+|\\\)|\\\]))?\s*$/.test(after);
    if (!allowCaretBeforeFractionClose || !trailingFractionClose || !isInsideMath(document, position)) return undefined;
    const source = line.text.trim();
    for (const [open, close] of [["\\[", "\\]"], ["\\(", "\\)"], ["$$", "$$"], ["$", "$"]] as const) {
      if (source.startsWith(open) && source.endsWith(close)) {
        const openIndex = line.text.indexOf(open);
        const closeIndex = line.text.lastIndexOf(close);
        const expression = line.text.slice(openIndex + open.length, closeIndex).trim();
        if (!expression) return undefined;
        return {
          expression,
          insertPosition: position,
          replacementRange: new vscode.Range(position, position),
          closingDelimiter: "",
          mathMode: true
        };
      }
    }
    return {
      expression: source,
      insertPosition: position,
      replacementRange: new vscode.Range(position, position),
      closingDelimiter: "",
      mathMode: true
    };
  }

  const source = line.text.trim();
  if (!source) return undefined;

  for (const [open, close] of [["\\[", "\\]"], ["\\(", "\\)"], ["$$", "$$"], ["$", "$"]] as const) {
    if (source.startsWith(open) && source.endsWith(close) && source.length >= open.length + close.length) {
      const openIndex = line.text.indexOf(open);
      const closeIndex = line.text.lastIndexOf(close);
      const body = line.text.slice(openIndex + open.length, closeIndex).trim();
      if (!body) return undefined;
      const bodyStart = openIndex + open.length;
      const bodyEnd = bodyStart + line.text.slice(bodyStart, closeIndex).trimEnd().length;
      const insertPosition = new vscode.Position(position.line, bodyEnd);
      return {
        expression: body,
        insertPosition,
        replacementRange: new vscode.Range(insertPosition, position),
        closingDelimiter: close + line.text.slice(closeIndex + close.length),
        mathMode: true
      };
    }
  }

  return {
    expression: source,
    insertPosition: position,
    replacementRange: new vscode.Range(position, position),
    closingDelimiter: "",
    mathMode: isInsideMath(document, position)
  };
}

function completionSuffix(expression: string, result: string, closingDelimiter: string, mathMode: boolean): string {
  const isEquation = expression.includes("=");
  const separator = isEquation
    ? mathMode ? " \\quad\\Rightarrow\\quad " : " ⇒ "
    : " = ";
  return `${separator}${result}${closingDelimiter}`;
}

function provideInlineCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.InlineCompletionList | undefined {
  if (!vscode.workspace.getConfiguration("mathmate").get<boolean>("inlineResults", true)) return undefined;
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== document || !editor.selection.isEmpty || !editor.selection.active.isEqual(position)) return undefined;

  const mathLine = getMathLine(editor, false);
  if (!mathLine) return undefined;
  const answer = getDocumentAnswer(editor, position) ?? lastAnswer;
  const variables = getDocumentVariables(editor, position, answer);
  const result = calculateMath(mathLine.expression, getAngleUnit(), answer, variables);
  if (!result) return undefined;

  const item = new vscode.InlineCompletionItem(
    completionSuffix(mathLine.expression, result.value, mathLine.closingDelimiter, mathLine.mathMode),
    mathLine.replacementRange,
    {
      command: "mathmate.setAnswer",
      title: "Remember MathMate answer",
      arguments: [result.value]
    }
  );
  return new vscode.InlineCompletionList([item]);
}

async function calculateAtCursor(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !["latex", "markdown"].includes(editor.document.languageId)) return;

  const mathLine = getMathLine(editor, true);
  if (!mathLine) {
    void vscode.window.showInformationMessage("Put the caret at the end of a math line, or select an expression/equation.");
    return;
  }

  const answer = getDocumentAnswer(editor, editor.selection.active) ?? lastAnswer;
  const variables = getDocumentVariables(editor, editor.selection.active, answer);
  const result = calculateMath(mathLine.expression, getAngleUnit(), answer, variables);
  if (!result) {
    void vscode.window.showWarningMessage("MathMate supports arithmetic and single-variable linear equations, such as 2*pi+1 or 2x+3=7.");
    return;
  }

  const suffix = completionSuffix(mathLine.expression, result.value, mathLine.closingDelimiter, mathLine.mathMode);
  const applied = await editor.edit((builder) => builder.replace(mathLine.replacementRange, suffix));
  if (applied) rememberAnswer(result.value);
  void vscode.window.setStatusBarMessage(`MathMate: ${result.detail.toLowerCase()} → ${result.value}`, 4000);
}

async function finishEquationOnEnter(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !["latex", "markdown"].includes(editor.document.languageId) || !editor.selection.isEmpty) {
    await vscode.commands.executeCommand("type", { text: "\n" });
    return;
  }

  const mathLine = getMathLine(editor, false, true);
  if (!mathLine || !looksLikeMath(mathLine.expression)) {
    await vscode.commands.executeCommand("type", { text: "\n" });
    return;
  }

  const answer = getDocumentAnswer(editor, editor.selection.active) ?? lastAnswer;
  const variables = getDocumentVariables(editor, editor.selection.active, answer);
  const result = calculateMath(mathLine.expression, getAngleUnit(), answer, variables);
  if (!result && /\\(?:arc)?(?:sin|cos|tan)\b|\b(?:arc)?(?:sin|cos|tan)\s*\^?\s*-?1\b/i.test(mathLine.expression)) {
    void vscode.window.showWarningMessage("No real angle was calculated. For c = 6.2, a = 5.3, b = 3.217, use arcsin(a/c) or arctan(a/b); arcsin(a/b) is invalid because a/b > 1.");
  }
  const formattedExpression = toLatex(mathLine.expression);
  const conclusion = result
    ? ` \\quad\\Rightarrow\\quad ${formatResult(result.value)}`
    : "";
  const body = `${formattedExpression}${conclusion}`;
  const line = editor.document.lineAt(editor.selection.active.line);
  const trimmedLine = line.text.trim();
  const hasInlineDelimiter = ["$", "$$", "\\(", "\\["].some((delimiter) => trimmedLine.startsWith(delimiter));
  const alreadyInEnvironment = isInsideMath(editor.document, editor.selection.active) && !hasInlineDelimiter;
  const block = alreadyInEnvironment
    ? `${body}\n`
    : `$$\n${body}\n$$\n`;
  const insertionOffset = editor.document.offsetAt(line.range.start);
  const applied = await editor.edit((builder) => builder.replace(line.rangeIncludingLineBreak, block));
  if (!applied) return;
  if (result) rememberAnswer(result.value);

  const cursor = editor.document.positionAt(insertionOffset + block.length);
  editor.selection = new vscode.Selection(cursor, cursor);
}

function looksLikeMath(expression: string): boolean {
  return /[=+*/^]/.test(expression) || /\d\s*[-+*/^]|[-+*/^]\s*\d/.test(expression) ||
    /\\(?:sqrt|sin|cos|tan|asin|acos|atan|ln|log|pi)\b/.test(expression) ||
    /\b(?:sqrt|sin|cos|tan|asin|acos|atan|ln|log|pi|tau)\s*\(/i.test(expression);
}

function formatResult(value: string): string {
  if (value === "No solution" || value === "All values") {
    return `\\text{${value}}`;
  }
  return toLatex(value);
}

function getAngleUnit(): AngleUnit {
  return vscode.workspace.getConfiguration("mathmate").get<AngleUnit>("angleUnit", "degrees");
}

function setLastAnswer(value: string): void {
  rememberAnswer(value);
}

function rememberAnswer(value: string): void {
  const equalsIndex = value.lastIndexOf("=");
  const answer = (equalsIndex >= 0 ? value.slice(equalsIndex + 1) : value).trim();
  if (!answer || answer === "No solution" || answer === "All values") return;
  lastAnswer = answer;
}

function getDocumentAnswer(editor: vscode.TextEditor, position: vscode.Position): string | undefined {
  const documentPrefix = editor.document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const lines = documentPrefix.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const latexArrow = line.lastIndexOf("\\Rightarrow");
    const plainArrow = line.lastIndexOf("⇒");
    const arrowIndex = Math.max(latexArrow, plainArrow);
    if (arrowIndex < 0) continue;

    const arrowLength = arrowIndex === latexArrow ? "\\Rightarrow".length : 1;
    let answer = line.slice(arrowIndex + arrowLength).trim();
    answer = answer.replace(/^(?:\\quad\s*)+/, "").replace(/(?:\\\\|\$+|\\\)|\\\])\s*$/g, "").trim();
    if (!answer) continue;
    const equationAnswer = answer.match(/=\s*(.+)$/);
    return (equationAnswer?.[1] ?? answer).trim();
  }
  return undefined;
}

function getDocumentVariables(
  editor: vscode.TextEditor,
  position: vscode.Position,
  answer: string | undefined
): Readonly<Record<string, number>> {
  const prefix = editor.document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const lines = prefix.split(/\r?\n/);
  lines.pop(); // The current line is evaluated with the bindings gathered before it.
  const variables: Record<string, number> = {};

  for (const rawLine of lines) {
    const line = rawLine
      .split(/\\Rightarrow|⇒/, 1)[0]
      .replace(/\\(?:quad|qquad)\s*$/g, "")
      .trim();
    const assignment = line.match(/^(\\[a-zA-Z]+|[\p{L}]+)\s*=\s*(.+)$/u);
    if (!assignment) continue;

    const name = normalizeVariableName(assignment[1]);
    const value = calculateMath(assignment[2], getAngleUnit(), answer, variables)?.value;
    if (!value || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) continue;
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) variables[name] = numericValue;
  }
  return variables;
}
