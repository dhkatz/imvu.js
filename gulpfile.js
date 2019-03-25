const del = require('del');
const path = require('path');

const { src, dest, watch, series, parallel } = require('gulp');

const typescript = require('gulp-typescript');
const tslint = require('gulp-tslint').default;
const sourcemaps = require('gulp-sourcemaps');
const nodemon = require('gulp-nodemon');
const alias = require('gulp-ts-alias').default;

const project = typescript.createProject('tsconfig.json');
const linter = require('tslint').Linter.createProgram('tsconfig.json');

function lint() {
  return src('./src/**/*.ts')
    .pipe(tslint({ configuration: 'tslint.json', formatter: 'verbose', program: linter }))
    .pipe(tslint.report());
}

function build() {
  del.sync(['./build/**/*.*']);

  src('./src/**/*.json')
    .pipe(dest('build/'));

  const compiled = src('./src/**/*.ts')
    .pipe(alias({ configuration: project.config.compilerOptions }))
    .pipe(sourcemaps.init())
    .pipe(project());

  return compiled.js
    .pipe(sourcemaps.write({ sourceRoot: file => path.relative(path.join(file.cwd, file.path), file.base) }))
    .pipe(dest('build/'))
}

function update() {
  watch('./src/**/*.ts', series(lint, build));
}

function start() {
  return nodemon({
    script: './build/index.js',
    watch: './build/index.js',
  });
}

function serve() {
  return nodemon({
    script: './build/index.js',
    watch: './build/'
  });
}

exports.lint = lint;
exports.build = series(lint, build);
exports.watch = series(lint, build, update);
exports.start = series(lint, build, start);
exports.serve = series(lint, build, parallel(update, serve));
exports.default = series(lint, build);
