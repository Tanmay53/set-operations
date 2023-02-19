# SET OPERATION

Perform set operations like Union | [ Soon to be added : Intersection | Difference ] on SVG Paths.

## Supported Path Commands

* M: Move To
* Z: Close Path
* L: Line To
* Q: Qubic Bezier Curve To

## Usage

### Install through NPM
```sh
npm i set-operations-svg
```

### Import
```js
const { union } = require('set-operations-svg')
```

### Use
```js
let a = "M0 0L0 100L100 100L100 0Z"
let b = "M50 50L50 150L150 150L150 50Z"

let result = union(a, b)
// M0 0L0 100L50 100L50 150L150 150L150 50L100 50L100 0z
```