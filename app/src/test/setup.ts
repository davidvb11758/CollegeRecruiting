import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// The full suite runs many screens at once; give async lookups a little longer than the 1s default.
configure({ asyncUtilTimeout: 3000 })
