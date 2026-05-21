export async function chunkFiles(filePaths: string[]) {
  console.log(`Placeholder: chunk ${filePaths.length} file(s)`);
  return filePaths.map((filePath) => ({
    filePath,
    repo: 'unknown',
    startLine: 1,
    text: 'This is a placeholder chunk for ' + filePath,
  }));
}
