# Numerical Methods reference source

This directory is the maintainable source for the generated site under
`/numerical-methods/`.

- `chapters/` contains one semantic HTML fragment per chapter.
- `parts/` contains the four part introductions.
- `layouts/` contains the shared document shell.
- `content/` contains the application map, references, and static MathJax cache.
- `css/` and `js/` contain shared presentation and behavior.
- `data/chapters.json` is the canonical chapter order and route manifest.

Run `npm run build:numerical-methods` after editing source files. The build emits
a lightweight directory page at `/numerical-methods/`, the complete reference
at `/numerical-methods/all/`, four lighter part pages, shared assets, and the
legacy `numerical_methods.html` compatibility entry.

Run `npm run check:numerical-methods` before publishing. It checks chapter and
reference counts, duplicate IDs, local and cross-page anchors, assets, and
canvas registrations.

`npm run import:numerical-methods` is only for re-importing the original
monolithic page. Do not run it after the compatibility entry has replaced the
original source unless the original monolith has been restored first.
