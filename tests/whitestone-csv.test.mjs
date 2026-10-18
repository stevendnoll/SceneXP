// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The CSV reader and writer for Whitestone's spreadsheets
 * (scripts/whitestone/csv.mjs), held to RFC 4180 and to what Numbers and
 * Excel actually write: quotes, doubled quotes, line breaks inside a field,
 * CRLF, a byte order mark, and blank lines.
 */
import { parseCsv, readTable, csvCell, toCsv } from '../scripts/whitestone/csv.mjs';

const cells = (text) => parseCsv(text).map((r) => r.cells);

describe('parseCsv', () => {
    test('plain fields, with stray spaces around unquoted ones trimmed', () => {
        expect(cells('a,b,c\n1, 2 ,3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    });

    test('quoted fields keep commas, doubled quotes and their own spaces', () => {
        expect(cells('"Burners, grates","He said ""hi"""," padded "\n'))
            .toEqual([['Burners, grates', 'He said "hi"', ' padded ']]);
    });

    test('a line break inside quotes stays in the field, and lines are counted through it', () => {
        const rows = parseCsv('key,note\r\na,"two\r\nlines"\r\nb,after\r\n');
        expect(rows.map((r) => r.cells)).toEqual([['key', 'note'], ['a', 'two\r\nlines'], ['b', 'after']]);
        expect(rows.map((r) => r.line)).toEqual([1, 2, 4]);
    });

    test('CRLF, LF and a lone CR all end a record', () => {
        expect(cells('a\r\nb\nc\rd')).toEqual([['a'], ['b'], ['c'], ['d']]);
    });

    test('a byte order mark and blank lines are ignored, and line numbers still match the file', () => {
        const rows = parseCsv('﻿key,value\n\nversion,x\n\n');
        expect(rows.map((r) => r.cells)).toEqual([['key', 'value'], ['version', 'x']]);
        expect(rows.map((r) => r.line)).toEqual([1, 3]);
    });

    test('empty cells are kept, including a trailing one and a quoted empty one', () => {
        expect(cells('a,,c,\n"",x\n')).toEqual([['a', '', 'c', ''], ['', 'x']]);
    });

    test('the last record needs no line break', () => {
        expect(cells('a,b')).toEqual([['a', 'b']]);
        expect(cells('""')).toEqual([['']]);
    });

    test('spaces after a closing quote are dropped, other text is kept', () => {
        expect(cells('"a"  ,"b"c\n')).toEqual([['a', 'bc']]);
    });

    test('a quote left open names the line it began on', () => {
        expect(() => parseCsv('ok\nx,"never closed\nmore')).toThrow('line 2: a quoted field is never closed');
    });

    test('nothing at all is no records', () => {
        expect(parseCsv('')).toEqual([]);
        expect(parseCsv('\n\n')).toEqual([]);
    });
});

describe('readTable', () => {
    test('rows become values by column, in any column order, with headers matched without case', () => {
        const t = readTable('Value,KEY\nx,version\n', ['key', 'value']);
        expect(t.problems).toEqual([]);
        expect(t.rows).toEqual([{ line: 2, values: { value: 'x', key: 'version' } }]);
    });

    test('a short row reads its missing cells as empty, and a long one is a problem', () => {
        const t = readTable('a,b\n1\n1,2,3\n', ['a', 'b']);
        expect(t.rows[0].values).toEqual({ a: '1', b: '' });
        expect(t.problems).toEqual(['line 3: 3 cells, but the header has 2']);
    });

    test('missing, unknown and repeated columns are caught before any value is read', () => {
        expect(readTable('a\n1\n', ['a', 'b']).problems).toEqual(['line 1: missing column b']);
        expect(readTable('a,b,c,d\n', ['a', 'b']).problems).toEqual(['line 1: unknown columns c, d']);
        expect(readTable('a,b,a\n', ['a', 'b']).problems).toEqual(['line 1: repeated column a']);
        expect(readTable('', ['a']).problems).toEqual(['the file is empty']);
        expect(readTable('"open', ['a']).problems).toEqual(['line 1: a quoted field is never closed']);
    });
});

describe('writing', () => {
    test('a cell is quoted only when it must be', () => {
        expect(csvCell('plain')).toBe('plain');
        expect(csvCell('a, b')).toBe('"a, b"');
        expect(csvCell('say "hi"')).toBe('"say ""hi"""');
        expect(csvCell('two\nlines')).toBe('"two\nlines"');
        expect(csvCell(' padded')).toBe('" padded"');
        expect(csvCell(null)).toBe('');
        expect(csvCell(12)).toBe('12');
    });

    test('what is written reads back the same', () => {
        const rows = [['key', 'note'], ['a', 'Commas, "quotes" and\r\nbreaks'], ['b', ' spaced '], ['c', '']];
        const text = toCsv(rows);
        expect(text.endsWith('\r\n')).toBe(true);
        expect(cells(text)).toEqual(rows);
    });
});
