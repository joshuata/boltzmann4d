// Generic reader for the Boltzmann 3D `.set` format (replaces Java's Group/FileGroup/StreamTokenizer).
//
//   #Boltzmann3D V2.43        <- header line: format name and version
//   GlobalSettings {          <- group: a name followed by `{`
//     size 70 50 10           <- property: a name and one or more whitespace-separated values
//     # comment               <- `#` starts a comment that runs to the end of the line
//   }
//
// Group and property names are case-insensitive. Groups may repeat (e.g. ParticleGroup);
// a repeated property keeps its last value, as in Java.

import * as ohm from 'ohm-js';

export class SetFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetFileError';
  }
}

// Grammar for the file body. Newlines are significant (a property's values end at the end of
// its line), so `space` is redefined to skip spaces, tabs and comments but not line breaks.
// The header line is a comment as far as the grammar is concerned; parseSetFile reads it.
const grammar = ohm.grammar(String.raw`
  SetFile {
    File = Entry* end
    Entry = Group | Property | eol
    Group = word eol* "{" Entry* "}"
    Property = word word+
    word = (~delimiter any)+
    delimiter = "{" | "}" | "#" | eol | "\x00".." "
    eol = "\r\n" | "\n" | "\r"
    comment = "#" (~eol any)*
    space := ~eol ("\x00".." " | comment)
  }
`);

type Entry =
  | { kind: 'group'; name: string; entries: Entry[] }
  | { kind: 'property'; name: string; values: string[] }
  | null;

const semantics = grammar.createSemantics().addOperation<Entry | Entry[] | string>('entry', {
  File(entries, _end) {
    return entries.children.map((e) => e.entry() as Entry);
  },
  Group(name, _eols, _open, entries, _close) {
    return {
      kind: 'group',
      name: name.sourceString,
      entries: entries.children.map((e) => e.entry() as Entry),
    };
  },
  Property(name, values) {
    return {
      kind: 'property',
      name: name.sourceString,
      values: values.children.map((v) => v.sourceString),
    };
  },
  eol(_) {
    return null;
  },
});

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

export function parseNumber(word: string): number | undefined {
  return NUMBER.test(word) ? Number(word) : undefined;
}

export class SetGroup {
  readonly name: string;
  readonly #properties = new Map<string, string[]>();
  readonly #groups = new Map<string, SetGroup[]>();

  constructor(name: string) {
    this.name = name;
  }

  has(property: string): boolean {
    return this.#properties.has(property.toLowerCase());
  }

  /** All values of a property; throws if it is missing or has fewer than `minCount` values. */
  values(property: string, minCount = 1): string[] {
    const values = this.#properties.get(property.toLowerCase());
    if (!values) throw this.#error(property, 'is missing');
    if (values.length < minCount) {
      throw this.#error(property, `needs at least ${minCount} values, found ${values.length}`);
    }
    return values;
  }

  /** The single value of a property. */
  string(property: string): string {
    const values = this.values(property);
    if (values.length > 1) throw this.#error(property, 'has several values; one is expected');
    return values[0] ?? '';
  }

  /** The value at `index` (0-based) parsed as a number. */
  number(property: string, index = 0): number {
    const word = this.values(property, index + 1)[index] ?? '';
    const value = parseNumber(word);
    if (value === undefined) throw this.#error(property, `"${word}" is not a number`);
    return value;
  }

  /** `TRUE`/`FALSE` in any case. */
  boolean(property: string): boolean {
    const word = this.string(property).toUpperCase();
    if (word === 'TRUE') return true;
    if (word === 'FALSE') return false;
    throw this.#error(property, `"${word}" is not TRUE or FALSE`);
  }

  groups(name: string): SetGroup[] {
    return this.#groups.get(name.toLowerCase()) ?? [];
  }

  /** The one group with this name, or undefined if there is none. Throws if it repeats. */
  optionalGroup(name: string): SetGroup | undefined {
    const groups = this.groups(name);
    if (groups.length > 1) throw new SetFileError(`${this.name}: expected one ${name} group`);
    return groups[0];
  }

  group(name: string): SetGroup {
    const group = this.optionalGroup(name);
    if (!group) throw new SetFileError(`Missing section: ${name}`);
    return group;
  }

  /** @internal parser use */
  setProperty(name: string, values: string[]): void {
    this.#properties.set(name.toLowerCase(), values);
  }

  /** @internal parser use */
  addGroup(group: SetGroup): void {
    const key = group.name.toLowerCase();
    const list = this.#groups.get(key);
    if (list) list.push(group);
    else this.#groups.set(key, [group]);
  }

  #error(property: string, problem: string): SetFileError {
    return new SetFileError(`${this.name}.${property} ${problem}`);
  }
}

export interface SetFile {
  /** From the header line, e.g. `Boltzmann3D`; empty if the file has no header. */
  formatName: string;
  /** From the header line, e.g. `V2.43`; empty if absent. */
  version: string;
  root: SetGroup;
}

export function parseSetFile(text: string): SetFile {
  const match = grammar.match(text);
  if (match.failed()) throw new SetFileError(match.shortMessage ?? 'Invalid .set file');

  const fill = (group: SetGroup, entries: Entry[]) => {
    for (const entry of entries) {
      if (entry?.kind === 'property') group.setProperty(entry.name, entry.values);
      else if (entry?.kind === 'group') {
        const child = new SetGroup(entry.name);
        group.addGroup(child);
        fill(child, entry.entries);
      }
    }
  };
  const root = new SetGroup('');
  fill(root, semantics(match).entry() as Entry[]);

  const header = /^#(\S*)[ \t]*(\S*)/.exec(text);
  return { formatName: header?.[1] ?? '', version: header?.[2] ?? '', root };
}
