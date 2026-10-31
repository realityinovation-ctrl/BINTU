/** Python repr of a list of strings, used in the reference error text. */

export function pythonList(values: readonly string[]): string {
  return `[${values.map((value) => `'${value}'`).join(", ")}]`;
}

export function pythonQuoted(value: string): string {
  return `'${value}'`;
}
