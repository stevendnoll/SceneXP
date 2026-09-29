// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * RUN A HEAVY, PURE JOB OUTSIDE JEST'S SANDBOX (2026-09-29).
 *
 * Jest runs every module inside its own vm sandbox, and hot numeric code
 * runs far slower there than in plain Node: X's and O's `getCoordDistance`,
 * called three million times, took 1,594 ms in a test and 10 ms in Node.
 * A suite that simulates hundreds of whole plays to measure the game (how
 * often a big play happens, the longest a play can run) spent almost all
 * of its time there, and the two X's and O's suites that do it set the
 * length of the full run at about 150 s each.
 *
 * So the simulating is done in a worker thread, which is plain Node, and
 * only the measuring stays in the test. The job is an async function that
 * stands alone: it closes over nothing, since only its source crosses to
 * the worker. It is handed its `args` and `load(path)`, which imports a
 * module by its path from the repository's root, and what it returns must
 * survive structuredClone (plain data: no functions). Anything it needs
 * from the browser's stand-ins it installs itself, as a test would, and a
 * job that seeds Math.random seeds the worker's own.
 *
 * What runs in a worker is not counted by coverage, so this is for the
 * sweeps that re-run code the rest of a suite already drives, not a way
 * round testing it.
 */
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const RUNNER = `
const { parentPort, workerData } = require('node:worker_threads');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');
const { source, args, root } = workerData;
const load = (path) => import(pathToFileURL(join(root, path)).href);
(async () => {
    try {
        const job = (0, eval)('(' + source + ')');
        parentPort.postMessage({ ok: true, value: await job(args, load) });
    } catch (error) {
        parentPort.postMessage({ ok: false, error: String(error && error.stack || error) });
    }
})();
`;

/** Run `job(args, load)` in a worker thread and resolve with what it
 *  returns (or reject with its error). */
export function outside(job, args = {}) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(RUNNER, { eval: true, workerData: { source: job.toString(), args, root } });
        worker.once('message', (message) => {
            worker.terminate();
            if (message.ok) resolve(message.value);
            else reject(new Error(`outside(): the job failed in its worker\n${message.error}`));
        });
        worker.once('error', reject);
    });
}
