const fs = require('fs');
const content = fs.readFileSync('mobile/src/screens/ToolsScreen.tsx', 'utf8');
const lines = content.split('\n').map(l => l.replace(/\r$/, ''));

// Step 1: Add useControlHub import after line 31 (after the last import)
// Find the line with 'import { deviceMemory }' and add useControlHub import after it
let insertImportAt = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("import { deviceMemory }")) {
    insertImportAt = i + 1;
    break;
  }
}
if (insertImportAt === -1) {
  console.error("Could not find deviceMemory import");
  process.exit(1);
}
lines.splice(insertImportAt, 0, "import { useControlHub } from '../components/tools/useControlHub';");

// Now indices shifted by 1. The function setup starts at original line 43 (now 44).
// Lines 0-62 (0-indexed) are the hook code ending with '} = hub'
// But now with the added import, line numbers shifted by 1.
// Original line 43 = new line 44, etc.
// Original line 62 = new line 63 (} = hub)
// Original line 63 = new line 64 (blank)
// Original line 64-942 = old return statement (need to remove)
// Original line 943 = new line 944 (blank before new return)
// Original line 944-946 = const isDrone, isNonRobocar, is2wd1mActive (duplicate)
// Original line 947 = blank
// Original line 948 = new return (
// Original lines 949+ = new JSX content
// Original line 1300 = } (extra closing)
// Original line 1301 = blank

// After adding import, the original lines are shifted by +1
// So we need to work with the new indices

// Find the new line numbers after adding import
// The old return starts at original line 64 (now 65)
// const isDrone definitions are at original lines 940-942 (now 941-943)
// New return starts at original line 944 (now 945)
// Extra } is at original line 1301 (now 1302)

// Remove old return and everything between } = hub and new return
// New line 63 = } = hub
// New line 64 = blank
// New line 65 = old return (
// ... old content ...
// New line 941 = const isDrone
// New line 942 = const isNonRobocar
// New line 943 = const is2wd1mActive
// New line 944 = blank
// New line 945 = return (
// ... new JSX ...
// New line 1301 = } (extra)
// New line 1302 = blank

// Keep lines 0-63 (through } = hub)
// Add blank line
// Remove old const isDrone definitions (they duplicate the hub destructuring)
// Keep new return content starting from blank line before return

// Find the new return statement
let newReturnStart = -1;
for (let i = 64; i < lines.length; i++) {
  if (lines[i].trim() === 'return (' && i > 64) {
    newReturnStart = i;
    break;
  }
}
if (newReturnStart === -1) {
  console.error("Could not find new return statement");
  process.exit(1);
}

// Find the end of the file (remove extra } and blank)
// The last } closing the function should be the one before the extra one
// We need to remove the last two lines (} and blank)
// But keep the proper } closing the function

// Build new file
const newLines = [];
// Keep lines 0-63 (through } = hub)
for (let i = 0; i <= 63; i++) {
  newLines.push(lines[i]);
}
// Add blank line
newLines.push('');
// Add const isDrone definitions (they were at original lines 940-942, now 941-943)
// But wait - these are duplicates of the hub destructuring at line 61.
// The hub destructuring already provides isDrone, isNonRobocar, is2wd1mActive.
// So we should NOT add these again.
// Instead, just keep the new return statement and its content.

// Keep lines from newReturnStart to end, but remove the extra } and blank at the end
// The last lines should end with } closing the function, not an extra }

// Find the last meaningful line (should be } closing the function)
let lastMeaningfulLine = lines.length - 1;
while (lastMeaningfulLine > 0 && (lines[lastMeaningfulLine].trim() === '' || lines[lastMeaningfulLine].trim() === '}')) {
  lastMeaningfulLine--;
}
// Now lastMeaningfulLine is the last non-empty/non-} line
// The lines after it should be the closing } of the function and possibly extra }

// Actually, let me just keep everything from newReturnStart to the end,
// but remove the extra } and blank line at the very end
const endLines = lines.slice(newReturnStart);
// Remove trailing blank lines and extra }
while (endLines.length > 0 && endLines[endLines.length - 1].trim() === '') {
  endLines.pop();
}
// Now the last line should be } (closing the function)
// But there might be an extra } after it
if (endLines.length >= 2 && endLines[endLines.length - 1].trim() === '}' && endLines[endLines.length - 2].trim() === '}') {
  // Remove the extra }
  endLines.pop();
}

for (const line of endLines) {
  newLines.push(line);
}

// Write the fixed file
const output = newLines.join('\n');
fs.writeFileSync('mobile/src/screens/ToolsScreen.tsx', output);
console.log('Done. Original lines:', lines.length, 'New lines:', newLines.length);
console.log('Last 5 lines:');
for (let i = newLines.length - 5; i < newLines.length; i++) console.log((i+1) + ':', newLines[i]);
