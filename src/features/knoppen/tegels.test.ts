import { describe, expect, it } from 'vitest'
import { schoneTegels, tegelZichtbaar } from './tegels'

describe('tegelkeuze', () => {
  it('null of geen lijst betekent: alles zichtbaar', () => {
    expect(schoneTegels(null)).toBeNull()
    expect(schoneTegels('wie')).toBeNull()
  })

  it('laat alleen bekende kiesbare tegels door, zonder dubbele', () => {
    expect(schoneTegels(['wie', 'wie', 'onbekend', 'vandaag', 'radio', 42])).toEqual(['wie', 'radio'])
  })

  it('vaste tegels zijn altijd zichtbaar, ook als de keuze leeg is', () => {
    expect(tegelZichtbaar('vandaag', [], false)).toBe(true)
    expect(tegelZichtbaar('onthouden', [], false)).toBe(true)
    expect(tegelZichtbaar('herinneringen', [], false)).toBe(true)
    expect(tegelZichtbaar('help', [], false)).toBe(true)
  })

  it('kiesbare tegels volgen de keuze', () => {
    expect(tegelZichtbaar('wie', ['wie'], false)).toBe(true)
    expect(tegelZichtbaar('radio', ['wie'], false)).toBe(false)
    expect(tegelZichtbaar('radio', null, false)).toBe(true)
  })

  it('zorgteam komt er alleen bij een lopend WZC-verblijf', () => {
    expect(tegelZichtbaar('zorgteam', null, false)).toBe(false)
    expect(tegelZichtbaar('zorgteam', null, true)).toBe(true)
  })
})
