const { union } = require('../src')

test("Basic Shape with Absolute Lines", () => {
    let a = "M0 0L0 100L100 100L100 0Z"
    let b = "M50 50L50 150L150 150L150 50Z"
    let result = "M0 0L0 100L50 100L50 150L150 150L150 50L100 50L100 0z"

    expect(union(a, b)).toBe(result)
})