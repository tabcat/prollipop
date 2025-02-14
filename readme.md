# prollipop 🍭

A modded [Prolly-tree](https://www.dolthub.com/blog/2024-03-03-prolly-trees/) implementation in Typescript.

## Features

- **Efficient diff** - yields entry and bucket diffs!
- **Powerful cursor api** - climb 🌳s like a pro
- **Structural validation** - codec is aware of tree context

## Project Status

Investigating a bug that has to do with async iterable updates given to mutate function.

It's in a decent state but have not done performance analysis. API breaks will result in major version change.

I haven't tested with non-local blockstores. Things may not work well with networked blockstores.

## Data-structure

This package implements a modded prolly-tree in Typescript. Most relevant code is in [`src/mutate.ts`](https://github.com/tabcat/prollipop/blob/master/src/mutate.ts) and [`src/diff.ts`](https://github.com/tabcat/prollipop/blob/master/src/diff.ts).

mods:

- (number, uint8array) tuples for keys
- right-side backbone
- key-defined boundaries instead of rolling-hash

## Install

`npm install prollipop`

## Build

`pnpm install && pnpm build`

## Usage

**See [usage.test.ts](https://github.com/tabcat/prollipop/blob/master/test/usage.test.ts)!!!**

**API [docs](https://tabcat.github.io/prollipop/)**

**Example [database](https://github.com/tabcat/prollipop/blob/master/src/database.ts)**

## Learning Resources:

As you can see from the list below, a lot of ideas have been stolen from the [Dolt](https://www.dolthub.com/) project's blog so be sure to check them out!

- [Prolly Trees](https://www.dolthub.com/blog/2024-03-03-prolly-trees/)
  - author: [Tim Sehn](https://github.com/timsehn)
  - implementation: [dolt](https://github.com/dolthub/dolt)
  - relevance: great introduction to prolly-trees

- [Prolly Tree PoC and technical writeup](https://github.com/waku-org/research/issues/78)
  - author: [ABresting](https://github.com/ABresting)
  - implementation: [Prolly-tree-Waku-Message](https://github.com/ABresting/Prolly-Tree-Waku-Message)
  - relevance: Custom implementation of prolly-tree with right side backbone

- [Merklizing the key/value store for fun and profit](https://joelgustafson.com/posts/2023-05-04/merklizing-the-key-value-store-for-fun-and-profit)
  - author: [Joel Gustafson](https://joelgustafson.com/)
  - implementation: [okra-js](https://github.com/canvasxyz/okra-js/tree/main/packages/okra)
  - relevance: content-defined merkle trees: A node is the first child of its parent if u32(node.hash[0..4]) < (2^32 / Q).

- [Efficient Diff on Prolly-trees](https://www.dolthub.com/blog/2020-06-16-efficient-diff-on-prolly-trees/)
  - author: [Aaron Son](https://github.com/reltuk)
  - implementation: [dolt](https://github.com/dolthub/dolt)
  - relevance: excellent visual examples for prolly-tree diffs

- [Only Consider Keys](https://docs.dolthub.com/architecture/storage-engine/prolly-tree#only-consider-keys)
  - author: [Tim Sehn](https://github.com/timsehn)
  - implementation: [dolt](https://github.com/dolthub/dolt)
  - relevance: only consider keys for chunk boundary, not keys + values

- [Range-Based Set Reconciliation](https://logperiodic.com/rbsr.html)
  - author: [Doug Hoyte](https://hoytech.com/about)
  - relevance: Negantrophy section uses [number, hash] tuples as keys

### Additional Resources:

- https://github.com/canvasxyz/okra?tab=readme-ov-file#design
- https://github.com/ipld/ipld/blob/prolly-trees/specs/advanced-data-layouts/prollytree/spec.md
- https://github.com/mikeal/prolly-trees


