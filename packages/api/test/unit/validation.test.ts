import { describe, expect, it } from 'vitest'
import { dependencyInput, serviceInput } from '../../src/http/validation'

describe('serviceInput', () => {
  it('applies defaults for kind and tier', () => {
    const v = serviceInput.parse({ key: 'auth', name: 'Auth' })
    expect(v.kind).toBe('service')
    expect(v.tier).toBe(2)
  })

  it('rejects an empty key', () => {
    expect(() => serviceInput.parse({ key: '', name: 'Auth' })).toThrow()
  })

  it('rejects an unknown kind', () => {
    expect(() => serviceInput.parse({ key: 'auth', name: 'Auth', kind: 'nope' })).toThrow()
  })
})

describe('dependencyInput', () => {
  const u1 = '11111111-1111-1111-1111-111111111111'
  const u2 = '22222222-2222-2222-2222-222222222222'

  it('accepts two distinct UUIDs and defaults kind to sync', () => {
    const v = dependencyInput.parse({ from: u1, to: u2 })
    expect(v.kind).toBe('sync')
    expect(v.critical).toBe(true)
  })

  it('rejects a self-dependency', () => {
    expect(() => dependencyInput.parse({ from: u1, to: u1 })).toThrow()
  })

  it('rejects a non-UUID identifier', () => {
    expect(() => dependencyInput.parse({ from: 'not-a-uuid', to: u2 })).toThrow()
  })
})
