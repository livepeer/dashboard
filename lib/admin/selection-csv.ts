export type SelectionExportRow = { email: string; joinedAt: string };

export function selectionCsv(rows: SelectionExportRow[]) {
  const cell = (value: string) => {
    const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [["Email", "Joined"], ...rows.map((row) => [row.email, row.joinedAt])]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
