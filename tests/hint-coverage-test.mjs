/**
 * Sudoku Hint Coverage Test
 * Fetches puzzles from dosuku API and tests:
 * 1. Solver correctness (backtracking matches API solution)
 * 2. Logical hint coverage (can hints solve the puzzle without backtracking?)
 * 
 * Usage: node tests/hint-coverage-test.mjs [count]
 */

const API_URL = 'https://sudoku-api.vercel.app/api/dosuku';
const FETCH_COUNT = parseInt(process.argv[2]) || 20;

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load source files and eval them ──────────────────
const candidatesCode = readFileSync(join(__dirname, '..', 'js', 'candidates.js'), 'utf-8')
    .replace(/export\s+/g, '');
const CandidateManager = new Function(candidatesCode + '\nreturn CandidateManager;')();

const solverCode = readFileSync(join(__dirname, '..', 'js', 'solver.js'), 'utf-8')
    .replace(/import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?/g, '')
    .replace(/export\s+/g, '');
const SudokuSolver = new Function('CandidateManager', solverCode + '\nreturn SudokuSolver;')(CandidateManager);

// ── Helpers ──────────────────────────────────────────
async function fetchPuzzle() {
    const res = await fetch(API_URL);
    const text = await res.text();
    const data = JSON.parse(text);
    const board = data.newboard.grids[0];
    return { puzzle: board.value, solution: board.solution, difficulty: board.difficulty };
}

function gridsMatch(a, b) {
    for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
            if (a[r][c] !== b[r][c]) return false;
    return true;
}

function isComplete(grid) {
    for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
            if (grid[r][c] === 0) return false;
    return true;
}

function tryLogicalSolve(puzzleGrid) {
    const solver = new SudokuSolver();
    const grid = puzzleGrid.map(r => [...r]);
    solver.resetEliminations();
    let steps = 0;
    const maxSteps = 500;
    const techniques = {};

    while (!isComplete(grid) && steps < maxSteps) {
        const step = solver.getNextStep(grid);
        if (!step || step.type === 'error') break;
        steps++;
        const t = step.type || 'unknown';
        techniques[t] = (techniques[t] || 0) + 1;
        if (step.cell && step.value) {
            grid[step.cell.row][step.cell.col] = step.value;
        }
    }
    return { solved: isComplete(grid), steps, techniques, grid };
}

// ── Main ─────────────────────────────────────────────
async function main() {
    console.log(`\n🧩 Sudoku Hint Coverage Test`);
    console.log(`   Fetching ${FETCH_COUNT} puzzles from dosuku API...\n`);
    console.log(`${'#'.padStart(3)} ${'DIFF'.padEnd(8)} ${'SOLVER'.padEnd(8)} ${'API✓'.padEnd(6)} ${'LOGICAL'.padEnd(9)} ${'STEPS'.padStart(5)}  TECHNIQUES`);
    console.log('─'.repeat(90));

    const solver = new SudokuSolver();
    let totalSolved = 0, totalMatch = 0, totalLogical = 0, totalErrors = 0;
    const diffCounts = {};

    for (let i = 0; i < FETCH_COUNT; i++) {
        try {
            const { puzzle, solution, difficulty } = await fetchPuzzle();
            diffCounts[difficulty] = (diffCounts[difficulty] || 0) + 1;

            // Test 1: Backtracking solve
            const solverResult = solver.solveComplete(puzzle);
            const solved = !!solverResult;
            if (solved) totalSolved++;

            // Test 2: Matches API solution?
            const matches = solved && gridsMatch(solverResult, solution);
            if (matches) totalMatch++;

            // Test 3: Logical hint solve
            const logical = tryLogicalSolve(puzzle);
            if (logical.solved) totalLogical++;

            const techStr = Object.entries(logical.techniques)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => `${k}:${v}`)
                .join(' ');

            const sIcon = solved ? '✅' : '❌';
            const mIcon = matches ? '✅' : '❌';
            const lIcon = logical.solved ? '✅' : '❌';

            console.log(
                `${String(i + 1).padStart(3)} ${difficulty.padEnd(8)} ${sIcon.padEnd(6)}   ${mIcon.padEnd(4)}   ${lIcon.padEnd(7)}   ${String(logical.steps).padStart(5)}  ${techStr}`
            );

            await new Promise(r => setTimeout(r, 200));
        } catch (e) {
            totalErrors++;
            console.log(`${String(i + 1).padStart(3)} ERROR: ${e.message}`);
        }
    }

    console.log('─'.repeat(90));
    console.log(`\n📊 SUMMARY`);
    console.log(`   Attempts:  ${FETCH_COUNT}`);
    console.log(`   Solved:    ${totalSolved}/${FETCH_COUNT}`);
    console.log(`   API Match: ${totalMatch}/${FETCH_COUNT}`);
    console.log(`   Logical:   ${totalLogical}/${FETCH_COUNT} (${Math.round(totalLogical / FETCH_COUNT * 100)}%)`);
    console.log(`   Errors:    ${totalErrors}`);
    console.log(`   Difficulties: ${JSON.stringify(diffCounts)}`);
    console.log();
}

main().catch(console.error);
