/**
 * Local Sudoku Puzzle Generator
 * Generates unique-solution puzzles at various difficulties.
 * No API dependency — pure algorithmic generation.
 *
 * Usage: node tests/generate_local.mjs [count_per_difficulty]
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load solver for uniqueness check
const candSrc = readFileSync(join(root, 'js/candidates.js'), 'utf-8').replace(/export\s+/g, '');
const CM = new Function(candSrc + '\nreturn CandidateManager;')();
const solverSrc = readFileSync(join(root, 'js/solver.js'), 'utf-8')
    .replace(/import\s+\{[^}]+\}\s+from\s+['`][^'`]+['`];?/g, '')
    .replace(/export\s+/g, '');
const SS = new Function('CandidateManager', solverSrc + '\nreturn SudokuSolver;')(CM);

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Generate a random complete valid Sudoku grid */
function generateSolvedGrid() {
    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));

    function isValid(g, r, c, v) {
        for (let i = 0; i < 9; i++) {
            if (g[r][i] === v || g[i][c] === v) return false;
        }
        const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
        for (let rr = br; rr < br + 3; rr++)
            for (let cc = bc; cc < bc + 3; cc++)
                if (g[rr][cc] === v) return false;
        return true;
    }

    function fill(g) {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (g[r][c] !== 0) continue;
                const vals = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
                for (const v of vals) {
                    if (!isValid(g, r, c, v)) continue;
                    g[r][c] = v;
                    if (fill(g)) return true;
                    g[r][c] = 0;
                }
                return false;
            }
        }
        return true;
    }

    fill(grid);
    return grid;
}

/** Count solutions (up to limit) */
function countSolutions(grid, limit = 2) {
    const cm = new CM();
    let count = 0;

    function solve(g) {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (g[r][c] !== 0) continue;
                const cands = cm.calculate(g);
                const vals = [...cands[r][c]];
                for (const v of vals) {
                    g[r][c] = v;
                    solve(g);
                    if (count >= limit) return;
                    g[r][c] = 0;
                }
                return;
            }
        }
        count++;
    }

    solve(grid.map(r => [...r]));
    return count;
}

/** Generate a puzzle by removing cells from a solved grid */
function generatePuzzle(targetGivens) {
    const solution = generateSolvedGrid();
    const puzzle = solution.map(r => [...r]);

    // Random order of cell positions
    const positions = shuffle(
        Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9])
    );

    let givens = 81;
    for (const [r, c] of positions) {
        if (givens <= targetGivens) break;
        const backup = puzzle[r][c];
        puzzle[r][c] = 0;

        if (countSolutions(puzzle, 2) === 1) {
            givens--;
        } else {
            puzzle[r][c] = backup; // restore — removing this breaks uniqueness
        }
    }

    return { puzzle, solution, givens };
}

function gridToStr(g) { return g.flat().join(''); }

// Difficulty ranges (by number of givens)
const DIFFICULTY = {
    easy: { min: 36, max: 45 },
    medium: { min: 30, max: 35 },
    hard: { min: 25, max: 29 },
    expert: { min: 20, max: 24 },
};

const target = parseInt(process.argv[2]) || 50;
const results = { easy: [], medium: [], hard: [], expert: [] };

console.log(`Generating ${target} puzzles per difficulty...`);

for (const [diff, range] of Object.entries(DIFFICULTY)) {
    const targetGivens = Math.floor((range.min + range.max) / 2);
    console.log(`\n${diff} (target ~${targetGivens} givens):`);

    for (let i = 0; i < target; i++) {
        const { puzzle, solution, givens } = generatePuzzle(targetGivens);
        results[diff].push({
            puzzle: gridToStr(puzzle),
            solution: gridToStr(solution),
        });
        process.stdout.write(`${i + 1} `);
    }
}

// Build output for puzzles.js
const lines = ['const PUZZLES = {'];
for (const [diff, puzzles] of Object.entries(results)) {
    lines.push(`  ${diff}: [`);
    for (const p of puzzles) {
        lines.push(`    { puzzle: '${p.puzzle}', solution: '${p.solution}' },`);
    }
    lines.push('  ],');
}
lines.push('};');

writeFileSync(join(root, 'tests/generated_puzzles.js'), lines.join('\n'));
console.log(`\n\nDone! ${Object.values(results).reduce((a, b) => a + b.length, 0)} puzzles saved to tests/generated_puzzles.js`);
