export { Product } from './Product.js';
export type { ManifestEntry, LoadProductOptions, ModelPart, ProductModel, ChknOptions } from './Product.js';

export { CdnProductSource, probeLatestRevision, PRODUCTDATA_URL } from './ProductSource.js';
export type {
	ProductSource,
	FetchedCfl,
	RevisionResolver,
	CdnProductSourceOptions,
	ProbeOptions,
} from './ProductSource.js';

export { ProductDefinition, valuesStartingWith, numberedValues, toInt, toNumber } from './ProductDefinition.js';
export type {
	MeshSpec,
	MaterialSpec,
	BodyPartSpec,
	ActionSpec,
	EnsembleSpec,
	AnimationEffectSpec,
} from './ProductDefinition.js';

export {
	parseTemplate,
	expandTemplate,
	mergeParent,
	pruneDeletions,
	findImports,
	writeTemplate,
	productIdFromUrl,
	DATA_IMPORT,
} from './template.js';
export type { TemplateDict, TemplateValue } from './template.js';

export { CflArchive, CflCompression } from './Cfl.js';
export type { CflEntry } from './Cfl.js';
export { cflToChkn, readChkn, writeChkn } from './chkn.js';
export { decompressLzma } from './lzma.js';
export { ChknError } from './errors.js';
