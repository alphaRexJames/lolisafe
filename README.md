# lolisafe, a small safe worth protecting

[![tohru.is-very-cute.moe](https://tohru.is-very-cute.moe/ZoivYbEW.png)](https://tohru.is-very-cute.moe)

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://raw.githubusercontent.com/WeebDev/lolisafe/master/LICENSE)

## `tohru.is-very-cute.moe`

[![JavaScript Style Guide](https://cdn.rawgit.com/standard/standard/master/badge.svg)](https://github.com/standard/standard)

This fork of a fork is the one being used at [https://tohru.is-very-cute.moe](https://tohru.is-very-cute.moe). Based off of [BobbyWibowo's fork](https://github.com/BobbyWibowo/lolisafe). If you are looking for the original, head to [WeebDev/lolisafe](https://github.com/WeebDev/lolisafe).

If you want to use an existing lolisafe database with this fork, run `node ./database/migration.js` at least once to create the new columns introduced in this branch (don't forget to make a backup).

Configuration file of lolisafe, `config.js`, is also NOT fully compatible with this fork. There are some options that had been renamed and/or restructured. Please make sure your config matches the sample in `config.sample.js` before starting.

## Running in production mode

1. Ensure you have at least Node v8.0.0 installed (v10.x is recommended).
2. Clone this repo.
3. Copy `config.sample.js` as `config.js`.
4. Modify port, domain and privacy options if desired.
5. Run `yarn install --production` to install all production dependencies (Yes, use [yarn](https://yarnpkg.com)).
6. Run `yarn start` to start the service.

> Default admin account:  
> Username: `root`  
> Password: `changeme`

You can also start it with `yarn pm2` if you have [PM2](https://pm2.keymetrics.io/).

When running in production mode, the safe will use pre-built client-side CSS/JS files from `dist` directory, while the actual source codes are in `src` directory.

The pre-built files were processed with [postcss-preset-env](https://github.com/csstools/postcss-preset-env), [cssnano](https://github.com/cssnano/cssnano), [bublé](https://github.com/bublejs/buble), and [terser](https://github.com/terser/terser).

## Running in development mode

This fork has a separate development mode, with which client-side CSS/JS files in `src` directory will be automatically rebuilt using [Gulp](https://github.com/gulpjs/gulp#what-is-gulp) tasks.

1. Follow step 1 to 4 from the production instructions above.
2. Run `yarn install` to install all dependencies (including development ones).
3. Run `yarn develop` to start the service in development mode.

You can configure the Gulp tasks through `gulpfile.js` file.

During development, the rebuilt files will be saved in `dist-dev` directory instead of `dist` directory. The service will also automatically serve the files from `dist-dev` directory instead. This is to avoid your IDE's Git from unnecessarily rebuilding diff of the modified files.

Once you feel like your modifications are ready for production usage, you can then run `yarn build` to build production-ready files that will actually go to `dist` directory.

## Script for missing thumbnails

Thumbnails will not be automatically generated for existing files, that had been uploaded prior to enabling thumbnails in the config file.

To generate thumbnails for those files, you can use `yarn thumbs`.

```none
$ yarn thumbs
$ node ./scripts/thumbs.js

Generate thumbnails.

Usage  :
node scripts/thumbs.js <mode=1|2|3> [force=0|1] [verbose=0|1] [cfcache=0|1]

mode   : 1 = images only, 2 = videos only, 3 = both images and videos
force  : 0 = no force (default), 1 = overwrite existing thumbnails
verbose: 0 = only print missing thumbs (default), 1 = print all
cfcache: 0 = do not clear cloudflare cache (default), 1 = clear cloudflare cache
```

For example, if you only want to generate thumbnails for image files without overwriting existing ones, you can run `yarn thumbs 1`.

Or if you want to generate thumbnails for both image and video files, while also overwriting existsing ones, you can run `yarn thumbs 3 1`.

## ClamAV support

This fork has an optional virus scanning support using [ClamAV](https://www.clamav.net/), through [clamdjs](https://github.com/NingLin-P/clamdjs) library.

It will scan new files right after they are uploaded. It will then print error messages to the uploaders (as in the virus names in ClamAV's databases) if the files are dirty.

On the down side, this will slow down uploads processing (as it has to wait for the scan results before responding the uploader's requests), however it's still highly recommended for public usage.

To enable this, make sure you have ClamAV daemon running, then fill in the daemon's IP and port into your config file.
