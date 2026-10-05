// @vitest-environment jsdom
import { it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Input from '@/components/ui/input/Input.vue'
it('keeps text IME composition behavior and does not model a file path', async () => {
  const text = mount(Input, { props: { modelValue: '' } }),
    input = text.get('input')
  await input.trigger('compositionstart')
  input.element.value = 'に'
  await input.trigger('input')
  await flushPromises()
  expect(text.emitted('update:modelValue')).toBeUndefined()
  await input.trigger('compositionend')
  await flushPromises()
  expect(text.emitted('update:modelValue')?.at(-1)).toEqual(['に'])
  text.unmount()
  const file = mount(Input, {
    props: { type: 'file' },
    attrs: { 'aria-label': 'Attachment' },
  })
  await file.get('input').trigger('input')
  await file.setProps({ class: 'updated' })
  expect(file.emitted('update:modelValue')).toBeUndefined()
  expect(file.get('input').attributes('type')).toBe('file')
  expect(file.get('input').attributes('aria-label')).toBe('Attachment')
  file.unmount()
})
