import { describe, expect, it } from 'vitest'
import { detectIOS } from './useInstall'

describe('detectIOS', () => {
  it('detecta iPhone', () => {
    expect(
      detectIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', 5),
    ).toBe(true)
  })

  it('detecta iPadOS disfrazado de Mac', () => {
    expect(
      detectIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5),
    ).toBe(true)
  })

  it('no confunde una Mac ni un Android', () => {
    expect(
      detectIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0),
    ).toBe(false)
    expect(detectIOS('Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140.0 Mobile', 5)).toBe(false)
  })
})
