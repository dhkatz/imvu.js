import del from 'del';
import tslint from 'gulp-tslint';

import sourcemaps from 'gulp-sourcemaps';
import alias from 'gulp-ts-alias';
import typescript from 'gulp-typescript';
import merge from 'merge2';
import path from 'path';

import { dest, series, src, watch } from 'gulp';
import { CompileStream } from 'gulp-typescript';

const project = typescript.createProject('tsconfig.json', { declarationFiles: true });
// tslint:disable-next-line:no-var-requires
const linter = require('tslint').Linter.createProgram('tsconfig.json');
const destination = 'lib/';

function lint() {
  return src(['src/**/*.ts'])
    .pipe(tslint({ configuration: 'tslint.json', formatter: 'verbose', program: linter }))
    .pipe(tslint.report());
}

function build() {
  del.sync([`${destination}**/*.*`]);

  const compiled: CompileStream = src(['src/**/*.ts'])
    .pipe(alias({ configuration: project.config.compilerOptions }))
    .pipe(sourcemaps.init())
    .pipe(project());

  return merge([
    compiled.js
    .pipe(sourcemaps.write({ sourceRoot: (file: any) => path.relative(path.join(file.cwd, file.path), file.base) }))
    .pipe(dest(destination)),
    compiled.dts
      .pipe(dest(destination)),
  ]);
}

function update() {
  watch('src/**/*.ts', series(lint, build));
}

exports.lint = lint;
exports.build = series(lint, build);
exports.watch = series(lint, build, update);
exports.default = series(lint, build);
