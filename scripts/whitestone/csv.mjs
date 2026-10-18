// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * csv.mjs - The CSV reader and writer for Whitestone's spreadsheets.
 *
 * Steve keeps the price sheet and the schedule as CSV files he edits in
 * Numbers or Excel (PLANNING 5.4), so this reads what those programs write:
 * RFC 4180 quoting (a field in double quotes may hold commas, line breaks and
 * doubled "" quotes), CRLF or LF line endings, a byte order mark at the
 * front, and blank lines, which are skipped. Nothing is trimmed inside a
 * quoted field. Unquoted fields are trimmed, since a stray space after a
 * comma is never meant.
 *
 * Errors name the line, so `check` can point at the cell to fix.
 *
 * Pure, and dependency-free.
 */

/** Every record in `text` as { line, cells }, where `line` is the 1-based
 *  line the record starts on. Throws on a quote left open. */
export function parseCsv(text) {
    let s = String(text);
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);

    const records = [];
    let cells = [];
    let cell = '';
    let quoted = false;      // inside a quoted field right now
    let wasQuoted = false;   // the current field began with a quote
    let line = 1;
    let recordLine = 1;
    let i = 0;

    const endCell = () => {
        cells.push(wasQuoted ? cell : cell.trim());
        cell = '';
        wasQuoted = false;
    };
    const endRecord = () => {
        // A blank line is one empty, UNQUOTED cell, and is skipped. A line
        // holding only "" is a record with one empty field.
        const blank = cells.length === 0 && !wasQuoted && cell.trim() === '';
        endCell();
        if (!blank) records.push({ line: recordLine, cells });
        cells = [];
    };

    while (i < s.length) {
        const c = s[i];
        if (quoted) {
            if (c === '"') {
                if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
                quoted = false;
                i++;
                continue;
            }
            if (c === '\n') line++;
            if (c === '\r') {
                // A CRLF inside a quoted field is one line break.
                line++;
                if (s[i + 1] === '\n') { cell += '\r\n'; i += 2; continue; }
            }
            cell += c;
            i++;
            continue;
        }
        if (c === '"' && cell.trim() === '' && !wasQuoted) {
            quoted = true;
            wasQuoted = true;
            cell = '';
            i++;
            continue;
        }
        if (c === ',') { endCell(); i++; continue; }
        if (c === '\r' || c === '\n') {
            endRecord();
            i += c === '\r' && s[i + 1] === '\n' ? 2 : 1;
            line++;
            recordLine = line;
            continue;
        }
        if (wasQuoted) {
            // Text after a closing quote: `"ab"c`. Tolerated as RFC 4180
            // readers usually do, by keeping it, except for the spaces a
            // spreadsheet may leave before the next comma.
            if (c !== ' ' && c !== '\t') cell += c;
            i++;
            continue;
        }
        cell += c;
        i++;
    }
    if (quoted) throw new Error(`line ${recordLine}: a quoted field is never closed`);
    if (cell !== '' || cells.length || wasQuoted) endRecord();
    return records;
}

/**
 * A CSV file with a header row, as { columns, rows }, where each row is
 * { line, values } and `values` maps column name to text. The header must
 * hold exactly the `expected` columns (in any order), so a renamed or missing
 * column is caught before any value is read. Problems are collected, never
 * thrown.
 */
export function readTable(text, expected) {
    const problems = [];
    let records;
    try {
        records = parseCsv(text);
    } catch (err) {
        return { columns: [], rows: [], problems: [err.message] };
    }
    if (!records.length) return { columns: [], rows: [], problems: ['the file is empty'] };

    const columns = records[0].cells.map((c) => c.toLowerCase());
    const missing = expected.filter((c) => !columns.includes(c));
    const extra = columns.filter((c) => !expected.includes(c));
    if (missing.length) problems.push(`line 1: missing column${missing.length > 1 ? 's' : ''} ${missing.join(', ')}`);
    if (extra.length) problems.push(`line 1: unknown column${extra.length > 1 ? 's' : ''} ${extra.join(', ')}`);
    const repeated = columns.filter((c, i) => columns.indexOf(c) !== i);
    if (repeated.length) problems.push(`line 1: repeated column ${repeated[0]}`);
    if (problems.length) return { columns, rows: [], problems };

    const rows = records.slice(1).map((r) => {
        if (r.cells.length > columns.length) {
            problems.push(`line ${r.line}: ${r.cells.length} cells, but the header has ${columns.length}`);
        }
        const values = {};
        columns.forEach((c, i) => { values[c] = r.cells[i] === undefined ? '' : r.cells[i]; });
        return { line: r.line, values };
    });
    return { columns, rows, problems };
}

/** One cell, quoted only when it has to be. */
export function csvCell(value) {
    const text = value == null ? '' : String(value);
    return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows of cells as CSV text with CRLF line endings, as RFC 4180 asks. */
export function toCsv(rows) {
    return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
