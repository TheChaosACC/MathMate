# MathMate

A small VS Code extension for quick calculations in LaTeX and Markdown math.

## Features

- While typing inside math mode, `pi` becomes `π`; common LaTeX symbol commands such as `\alpha`, `\theta`, `\times`, and `\leq` are replaced by their Unicode symbols.
- Type `/` after a math operand to turn it into a LaTeX fraction and move the caret into the denominator, e.g. typing `6.1/` creates `\frac{6.1}{}`. The fraction can still be calculated when you press Enter.
- At the end of a math line, an inline result appears as a ghost-text suggestion. Press **Tab** to accept it.
- Use `ans` in the next expression to reuse the last result, such as `ans*2`. MathMate remembers results from Enter, the Calculate command, and accepted Tab suggestions, and can also read the result after `\Rightarrow` in an earlier displayed equation in the same document.
- Define variables on earlier math lines and reuse them later; for example, `c = 6,2`, `a = 5.3`, then `b = sqrt(c^2-a^2)` and `alpha = arcsin(a/c)`. A comma between digits is treated as a decimal separator.
- Press **Enter** at the end of a math expression to turn it into a display-math block and append its result (or a linear equation's solution) when it can be calculated. In Markdown this uses `$$...$$`, which common Markdown math renderers understand.
- Solve one-variable linear equations, for example `2x + 3 = 7` → `x = 2`.
- Calculate arithmetic with parentheses, implicit multiplication, powers, trig/inverse trig, square roots, logarithms, exponentials, absolute value, and the constants `pi`, `e`, and `tau`.
- Calculate factorials with postfix `!`, for example `5!` → `120` (integer inputs from 0 to 170 are supported).
- Common additional math symbols are supported, including `\\sum`, `\\prod`, `\\int`, `\\partial`, `\\nabla`, set symbols, comparison symbols, arrows, and uppercase Greek letters. For example, `\\sum_{i=1}^{n} i` is formatted as displayable LaTeX; symbolic summations and integrals are formatted only and are not numerically evaluated yet.
- Group a full exponent with parentheses, for example `e^(i*pi)`; the calculator evaluates complex powers, and Enter formats the exponent as `e^{i\cdot\pi}`.
- Use `asin(6.1/7.5)`, `arcsin(6.1/7.5)`, or `sin^-1(6.1/7.5)` for inverse sine. To solve for an angle, enter `\alpha=sin^-1(6.1/7.5)`. Trig functions use degrees by default; change `mathmate.angleUnit` to `radians` if needed.
- Run **MathMate: Calculate or Solve Current Math** from the Command Palette, or use **Ctrl+Alt+M** (macOS: **Cmd+Option+M**).

Math lines can be plain expressions or wrapped in `$...$`, `$$...$$`, `\(...\)`, or `\[...\]`. In Markdown and LaTeX, automatic symbol replacement is limited to detected math regions. Functions use standard calculator notation such as `sin(30)` or `sqrt(9)` (LaTeX `\sqrt{9}` is also accepted). Linear equations can be solved, but graphing, calculus, matrices, and nonlinear equation solving are not included yet.

## Run the extension locally

1. Install Node.js and npm if they are not already installed.
2. In this folder, run `npm install` and then `npm run compile`.
3. Open this folder in VS Code and press **F5** to launch the Extension Development Host.
4. In the new window, open a `.tex` or Markdown file and type a math expression such as `2*pi+1`, `sqrt(9)`, or `2x+3=7`. Press **Enter** to format and calculate it, or use **Tab** to accept the inline result first.

Settings are available under **MathMate**:

- `mathmate.autoReplaceSymbols`
- `mathmate.inlineResults`
- `mathmate.angleUnit` (`degrees` by default, or `radians`)

## Publishing releases

Push a version tag such as `v0.0.1` to trigger the GitHub Actions release workflow. It builds and attaches the `.vsix` package to a GitHub Release. To also publish to the Visual Studio Marketplace, create a Marketplace Personal Access Token and add it to the GitHub repository as the Actions secret `VSCE_PAT`; the workflow uses the publisher ID `TheChaosACC`. Never commit the token to the repository.
