import process from 'node:process'

export const captureStream = (stream: 'stderr' | 'stdout', fn: () => void): string => {
  const target = stream === 'stdout' ? process.stdout : process.stderr
  const chunks: string[] = []
  const original = target.write.bind(target)
  target.write = (chunk: string): boolean => {
    chunks.push(chunk)
    return true
  }
  try {
    fn()
  } finally {
    target.write = original
  }
  return chunks.join('')
}
