// Transcript text is data. It is rendered only as React text nodes (never innerHTML or
// Markdown). URLs inside text stay plain text: we do not linkify customer content.

/** Splits text into paragraphs while preserving every character (no trimming). */
export function textLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}
