// Plain objects plus typed buffers survive workers and IndexedDB unchanged.
// Small studies retain ordinary arrays; larger matrices avoid an allocation
// for every two-to-five-number row. No quantization or probability pruning.
const COMPACT_ROWS = 24;
export function createMatrixArena() {
  let values,
    present,
    valueOffset = 0,
    rowOffset = 0;
  return (length, width) => {
    const count = length * width;
    if (!values || valueOffset + count > values.length) {
      values = new Float64Array(Math.max(131072, count));
      valueOffset = 0;
    }
    if (!present || rowOffset + length > present.length) {
      present = new Uint8Array(Math.max(131072, length));
      rowOffset = 0;
    }
    const result = {
      values: values.subarray(valueOffset, valueOffset + count),
      present: present.subarray(rowOffset, rowOffset + length),
    };
    valueOffset += count;
    rowOffset += length;
    return result;
  };
}
export function matrixRow(matrix, index) {
  if (!matrix) return null;
  if (Array.isArray(matrix)) return matrix[index] ?? null;
  if (!matrix.present[index]) return null;
  const start = index * matrix.width;
  // Consumers may map a row to labels or save it in a JSON training journal.
  // Return an ordinary array, never expose a writable view of shared storage.
  const row = Array(matrix.width);
  for (let a = 0; a < matrix.width; a++) row[a] = matrix.values[start + a];
  return row;
}
export function matrixValue(matrix, index, action) {
  if (!matrix) return undefined;
  if (Array.isArray(matrix)) return matrix[index]?.[action];
  if (!Number.isInteger(action) || action < 0 || action >= matrix.width)
    return undefined;
  return matrix.present[index]
    ? matrix.values[index * matrix.width + action]
    : undefined;
}
export function mapMatrix(matrix, width, transform, arena) {
  if (Array.isArray(matrix) && matrix.length < COMPACT_ROWS)
    return matrix.map(transform);
  const result = {
    length: matrix.length,
    width,
    ...(arena
      ? arena(matrix.length, width)
      : {
          values: new Float64Array(matrix.length * width),
          present: new Uint8Array(matrix.length),
        }),
  };
  for (let i = 0; i < matrix.length; i++) {
    const row = transform(matrixRow(matrix, i), i);
    if (row === null) continue;
    if (row.length !== width)
      throw Error("Invalid internal strategy row width");
    result.present[i] = 1;
    result.values.set(row, i * width);
  }
  return result;
}
export const packMatrix = (rows, width, arena) =>
  rows.length < COMPACT_ROWS
    ? rows
    : mapMatrix(rows, width, (row) => row, arena);
export const matrixRows = (matrix) =>
  Array.from({ length: matrix.length }, (_, i) => matrixRow(matrix, i));

// Transfer only completed worker results: this detaches the sender's buffers.
export function matrixTransfers(root) {
  const buffers = new Set();
  function visit(node) {
    if (!node) return;
    for (const name of ["policy", "model", "ev", "sizingEV", "adjusted"]) {
      const matrix = node[name];
      if (matrix?.values instanceof Float64Array) {
        buffers.add(matrix.values.buffer);
        buffers.add(matrix.present.buffer);
      }
    }
    if (node.children)
      for (const child of Object.values(node.children)) visit(child);
  }
  visit(root);
  return [...buffers];
}
