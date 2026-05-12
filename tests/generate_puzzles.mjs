/**
 * Fetch Hard/Medium/Easy puzzles from dosuku API, validate uniqueness,
 * and output valid puzzle strings for puzzles.js
 *
 * Usage: node tests/generate_puzzles.mjs [count_per_difficulty]
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load solver
const candSrc = readFileSync(join(root, 'js/candidates.js'), 'utf-8').replace(/export\s+/g, '');
const CM = new Function(candSrc + '\nreturn CandidateManager;')();
const solverSrc = readFileSync(join(root, 'js/solver.js'), 'utf-8')
    .replace(/import\s+\{[^}]+\}\s+from\s+['`][^'`]+['`];?/g, '')
    .replace(/export\s+/g, '');
const SS = new Function('CandidateManager', solverSrc + '\nreturn SudokuSolver;')(CM);

function gridToStr(grid) {
    return grid.map(r => r.join('')).join('');
}

function countSolutions(grid, limit = 2) {
    const cm = new CM();
    let count = 0;
    function solve(g) {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (g[r][c] !== 0) continue;
                const cands = cm.calculate(g);
                for (const v of cands[r][c]) {
                    g[r][c] = v;
                    if (solve(g)) { if (count >= limit) return true; }
                    g[r][c] = 0;
                }
                return false;
            }
        }
        count++;
        return count >= limit;
    }
    solve(grid.map(r => [...r]));
    return count;
}

const target = parseInt(process.argv[2]) || 50;
const results = { Easy: [], Medium: [], Hard: [] };
let attempts = 0;
const maxAttempts = target * 15;
const seen = new Set();

console.log(`Fetching puzzles... target: ${target} per difficulty`);

while (attempts < maxAttempts) {
    const allDone = Object.values(results).every(arr => arr.length >= target);
    if (allDone) break;

    attempts++;
    try {
        const r = await fetch('https://sudoku-api.vercel.app/api/dosuku');
        const d = await r.json();
        const b = d.newboard.grids[0];
        const diff = b.difficulty;
        if (!results[diff] || results[diff].length >= target) continue;

        const pStr = gridToStr(b.value);
        if (seen.has(pStr)) continue;
        seen.add(pStr);

        // Check uniqueness
        const sols = countSolutions(b.value, 2);
        if (sols !== 1) {
            process.stdout.write('x');
            continue;
        }

        // Solve to get solution
        const solver = new SS();
        const solution = solver.solveComplete(b.value);
        if (!solution) continue;

        const sStr = gridToStr(solution);
        results[diff].push({ puzzle: pStr, solution: sStr });
        process.stdout.write('.');

        if (results[diff].length % 10 === 0) {
            console.log(` ${diff}: ${results[diff].length}/${target}`);
        }

        await new Promise(r => setTimeout(r, 100));
    } catch (e) {
        process.stdout.write('E');
        await new Promise(r => setTimeout(r, 500));
    }
}

console.log('\n\n=== RESULTS ===');
for (const [diff, puzzles] of Object.entries(results)) {
    console.log(`${diff}: ${puzzles.length} unique-solution puzzles`);
}

// Output as JS format
const output = [];
for (const [diff, puzzles] of Object.entries(results)) {
    output.push(`  // ${diff}: ${puzzles.length} puzzles`);
    for (const p of puzzles) {
        output.push(`    { puzzle: '${p.puzzle}', solution: '${p.solution}' },`);
    }
}

const { writeFileSync } = await import('fs');
writeFileSync(join(root, 'tests/generated_puzzles.txt'), output.join('\n'));
console.log('\nSaved to tests/generated_puzzles.txt');
