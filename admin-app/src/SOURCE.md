# RankX AI store app: WordPress front end, source

This is the source of the store app's screens as they run inside wp-admin, published with the RankX AI plugin under
the GPL (version 2 or later). React is WordPress's own (the `react`, `react-dom` and `react-jsx-runtime` scripts).

Build: `npm install && npm run build` (the exact build tools are in package.json). Packages the source imports:
`react`, `react-dom` (types only at build time; at run time both are WordPress's).

145 files.
