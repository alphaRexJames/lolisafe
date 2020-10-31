# lolisafe, a small safe worth protecting

[![tohru.is-very-cute.moe](https://tohru.is-very-cute.moe/ZoivYbEW.png)](https://tohru.is-very-cute.moe)

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://raw.githubusercontent.com/WeebDev/lolisafe/master/LICENSE)

## `tohru.is-very-cute.moe`

[![JavaScript Style Guide](https://cdn.rawgit.com/standard/standard/master/badge.svg)](https://github.com/standard/standard)

This fork of a fork is the one being used at [https://tohru.is-very-cute.moe](https://tohru.is-very-cute.moe). Based off of [BobbyWibowo's fork](https://github.com/BobbyWibowo/lolisafe). If you are looking for the original, head to [WeebDev/lolisafe](https://github.com/WeebDev/lolisafe).

If you want to use an existing lolisafe database with this fork, run `node ./database/migration.js` (or `yarn migrate`) at least once to create the new columns introduced in this branch (don't forget to make a backup).

Configuration file of lolisafe, `config.js`, is also NOT fully compatible with this fork. There are some options that had been renamed and/or restructured. Please make sure your config matches the sample in `config.sample.js` before starting.

## Running in production mode

1. Ensure you have at least Node v10.x installed (v12.x works fine, but v14.x will likely have issues for now).
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

> If you are submitting a Pull Request, running `yarn build` before pushing the commit is NOT necessary. As long as the changes already work well in development mode, you may push the commit as-is.  
> This fork uses GitHub Actions to automatically rebuild client assets after every commit that modifies the source files in `src` directory.

## Failing to build dependencies

Some dependencies may fail to build with Python 2.x, in particular `sqlite3` package.

If that happens, I recommend building dependencies with Python 3.x instead.

To force Python 3.x for dependencies building, you can choose to create a file named `.npmrc` in your lolisafe root directory, and fill it with:

```none
python=/path/to/your/python3.x
```

Or you can try the alternative solutions listed in here: [https://github.com/nodejs/node-gyp#configuring-python-dependency](https://github.com/nodejs/node-gyp#configuring-python-dependency).

> Note: Despite the file being named `.npmrc`, that preference will also be used when installing dependencies with `yarn`, so I still recommend sticking with it.

## Updating when you have modified some files

Try to use [git stash](https://www.git-scm.com/docs/git-stash).

Basically you'll be doing this:

1. `git stash` to stash away your changes.
2. `git pull` to pull updates.
3. `yarn install` (or `yarn install --production`) to install dependencies matching the updated `yarn.lock` file.
4. `git stash pop` (or `git stash apply`) to restore your changes.

Be warned that some files may have been updated too heavily that they will require manual merging.

If you only do some small modifications such as editing `views/_globals.njk` and not much else, it's generally safe to do this even in a live production environment. But it's still best practice to at least review just what have been updated, and whether you will need to do some manual merging beforehand.

Still, I heavily recommend simply forking this repository and manually merging upstream changes whenever you feel like doing so. Read more about [syncing a fork](https://help.github.com/en/github/collaborating-with-issues-and-pull-requests/syncing-a-fork).

Afterwards, you can instead clone your fork in your production server and pull updates from there. You can then choose to only install production dependencies with `yarn install --production` there (hint: this is how I setup safe.fiery.me).

## Script for missing thumbnails

Thumbnails will not be automatically generated for files that were uploaded before enabling thumbnails generation in the config file.

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

For example, if you only want to generate thumbnails for image files without overwriting existing ones, you can run `yarn thumbs 1`, or if you want to generate thumbnails for both image and video files, while also overwriting existsing ones, you can run `yarn thumbs 3 1`.

You will also need to use this script to overwrite existing thumbnails if you want to change thumbnail size.

## ClamAV support

This fork has an optional virus scanning support using [ClamAV](https://www.clamav.net/), through [clamdjs](https://github.com/NingLin-P/clamdjs) library.

It will scan new files right after they are uploaded. It will then alert the uploaders of the virus names in ClamAV's database if their files are dirty.

Unfortunately, this will slow down uploads processing as it has to wait for scan results before responding the uploaders, however it's still highly recommended for public usage (or at least if you find Google Safe Search too annoying).

To enable this, make sure you have ClamAV daemon running, then fill in the daemon's IP and port into your config file.

From the config file you can also choose to exclude certain extensions from being scanned to lessen the burden on your server.
