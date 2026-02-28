/**
 * Mock cache implementations for testing
 *
 * Provides minimal singleton mock caches for test isolation.
 * These mocks implement only getInstance/resetInstance for singleton management.
 */

/**
 * Mock IdTagsCache for testing
 *
 * Minimal singleton mock for RFID tag cache.
 */
export class MockIdTagsCache {
  private static instance: MockIdTagsCache | null = null
  private readonly idTagsMap = new Map<string, string[]>()

  public static getInstance (): MockIdTagsCache {
    MockIdTagsCache.instance ??= new MockIdTagsCache()
    return MockIdTagsCache.instance
  }

  public static resetInstance (): void {
    MockIdTagsCache.instance = null
  }

  public getIdTags (file: string): string[] | undefined {
    return this.idTagsMap.get(file)
  }

  public setIdTags (file: string, idTags: string[]): void {
    this.idTagsMap.set(file, idTags)
  }
}

/**
 * Mock SharedLRUCache for testing
 *
 * Minimal singleton mock for shared LRU cache.
 */
export class MockSharedLRUCache {
  private static instance: MockSharedLRUCache | null = null
  private readonly _brand = 'MockSharedLRUCache' as const

  public static getInstance (): MockSharedLRUCache {
    MockSharedLRUCache.instance ??= new MockSharedLRUCache()
    return MockSharedLRUCache.instance
  }

  public static resetInstance (): void {
    MockSharedLRUCache.instance = null
  }
}
