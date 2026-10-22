---
'@imvu/chkn': minor
---

Implement `@imvu/chkn` (replacing the stub): read IMVU products end to end. `CflArchive` reads (and writes) CFL archives with a built-in LZMA decoder; `parseTemplate`/`expandTemplate` model `index.xml` templates and `__DATAIMPORT` inheritance exactly as the classic client does; `ProductDefinition` exposes meshes, material slots, body parts, skeleton and actions; `Product.load()` resolves a product's whole parent chain from a `ProductSource` (`CdnProductSource` for the productdata CDN), resolves assets through it, assembles its Cal3D model via `@imvu/cal3d`, and exports CHKN (ZIP) files with full-size textures. `cflToChkn`/`readChkn`/`writeChkn` replace the old cfl-converter.
