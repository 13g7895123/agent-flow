import { afterAll, afterEach, beforeAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { server } from './mocks/server'
import { cleanupRendered } from './test-utils'

beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  cleanupRendered()
  document.body.innerHTML = ''
})
afterAll(() => server.close())
