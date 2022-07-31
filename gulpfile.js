const { exec } = require('child_process')
const gulp = require('gulp')
const cssnano = require('cssnano')
const del = require('del')
const buble = require('gulp-buble')
const eslint = require('gulp-eslint-new')
const gulpif = require('gulp-if')
const nodemon = require('gulp-nodemon')
const postcss = require('gulp-postcss')
const postcssPresetEnv = require('postcss-preset-env')
const replace = require('gulp-replace')
const sass = require('gulp-dart-sass')
const sassCompiler = require('sass')
const sourcemaps = require('gulp-sourcemaps')
const stylelint = require('@ronilaukkarinen/gulp-stylelint')
const terser = require('gulp-terser')
let sassEmbeddedCompiler
try {
  sassEmbeddedCompiler = require('sass-embedded')
  console.log('Using "sass-embedded" package to compile sass\u2026')
} catch (_) {}

// Put built files for development on a Git-ignored directory.
// This will prevent IDE's Git from unnecessarily
// building diff's during development.
const dist = process.env.NODE_ENV === 'development'
  ? './dist-dev'
  : './dist'

const postcssPlugins = [
  postcssPresetEnv()
]

sass.compiler = sassEmbeddedCompiler || sassCompiler

// Minify on production
if (process.env.NODE_ENV !== 'development') {
  postcssPlugins.push(cssnano())
}

/** TASKS: LINT */

gulp.task('lint:style', () => {
  return gulp.src([
    './src/**/*.css',
    './src/**/*.scss'
  ])
    .pipe(stylelint({
      failAfterError: true,
      reporters: [{ formatter: 'string', console: true }]
    }))
})

gulp.task('lint:js', () => {
  return gulp.src([
    './*.js',
    './{controllers,database,routes,scripts,src}/**/*.js'
  ], {
    ignore: [
      './src/libs/**/*'
    ]
  })
    .pipe(eslint())
    .pipe(eslint.format('stylish'))
    .pipe(eslint.failAfterError())
})

// Set _settle to true, so that if one of the parallel tasks fails,
// the other one won't exit prematurely (this is a bit awkward).
// https://github.com/gulpjs/gulp/issues/1487#issuecomment-466621047
gulp._settle = true
gulp.task('lint', gulp.parallel('lint:style', 'lint:js'))
gulp._settle = false

/** TASKS: CLEAN */

gulp.task('clean:style', () => {
  return del([
    `${dist}/**/*.css`,
    `${dist}/**/*.css.map`
  ])
})

gulp.task('clean:js', () => {
  return del([
    `${dist}/**/*.js`,
    `${dist}/**/*.js.map`
  ])
})

gulp.task('clean:rest', () => {
  return del([
    `${dist}/*`
  ])
})

gulp.task('clean', gulp.parallel('clean:style', 'clean:js', 'clean:rest'))

/** TASKS: BUILD */

gulp.task('build:sass', function () {
  return gulp.src('./src/**/*.scss', {
    ignore: '_*.scss'
  })
    .pipe(sourcemaps.init())
    .pipe(sass().on('error', sass.logError))
    .pipe(postcss(postcssPlugins))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(dist))
})

gulp.task('build:css', () => {
  return gulp.src('./src/**/*.css', {
    ignore: './src/libs/fontello/fontello.css'
  })
    .pipe(sourcemaps.init())
    .pipe(postcss(postcssPlugins))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(dist))
})

gulp.task('build:fontello', () => {
  const version = require('./src/versions.json')[5]
  return gulp.src('./src/libs/fontello/fontello.css')
    .pipe(sourcemaps.init())
    .pipe(gulpif(version !== undefined, replace(/(fontello\.(eot|woff2?|woff|ttf|svg))/g, `$1?_=${version}`)))
    .pipe(postcss(postcssPlugins))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(`${dist}/libs/fontello`))
})

gulp.task('build:js', () => {
  return gulp.src('./src/**/*.js')
    .pipe(sourcemaps.init())
    .pipe(buble())
    // Minify on production
    .pipe(gulpif(process.env.NODE_ENV !== 'development', terser()))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(dist))
})

gulp.task('build', gulp.parallel('build:sass', 'build:css', 'build:fontello', 'build:js'))

/** TASKS: VERSION STRINGS */

gulp.task('exec:bump-versions', cb => {
  exec('node ./scripts/bump-versions.js 1', (error, stdout, stderr) => {
    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)
    cb(error)
  })
})

gulp.task('default', gulp.series('lint', 'clean', 'build', 'exec:bump-versions'))

/** TASKS: WATCH (SKIP LINTER) */

gulp.task('watch:scss', () => {
  return gulp.watch([
    'src/**/*.scss'
  ], gulp.series('build:sass'))
})

gulp.task('watch:css', () => {
  return gulp.watch([
    'src/**/*.css'
  ], {
    ignored: [
      'src/libs/fontello/fontello.css'
    ]
  }, gulp.series('build:css'))
})
gulp.task('watch:fontello', () => {
  return gulp.watch([
    'src/libs/fontello/fontello.css'
  ], gulp.series('build:fontello'))
})

gulp.task('watch:js', () => {
  return gulp.watch([
    'src/**/*.js'
  ], gulp.series('build:js'))
})

gulp.task('watch:src', gulp.parallel('watch:css', 'watch:scss', 'watch:fontello', 'watch:js'))

gulp.task('nodemon', cb => {
  return nodemon({
    script: './lolisafe.js',
    env: process.env,
    watch: [
      'controllers/',
      'routes/',
      'views/_globals.njk',
      'views/_layout.njk',
      'views/album.njk',
      'config.js',
      'logger.js',
      'lolisafe.js'
    ],
    ext: 'js',
    done: cb
  })
})

gulp.task('watch', gulp.series('clean', 'build', gulp.parallel('watch:src', 'nodemon')))
