# README

## cf-purge.js

```none
$ yarn cf-purge
$ node ./scripts/cf-purge.js
Purge Cloudflare's cache.

Usage:
node scripts/cf-purge.js ...filename

filename:
Upload names separated by space (will automatically include their thumbs if available).
```

## clean-up.js

```none
$ yarn clean-up -h
$ node ./scripts/clean-up.js -h
Clean up files that are not in the database.

Usage:
node scripts/clean-up.js [mode=0|1|2]

mode:
0 = Only list names of files that are not in the database.
1 = Clean up the files.
```

## delete-expired.js

```none
$ yarn delete-expired -h
$ node ./scripts/delete-expired.js -h
Bulk delete expired files.

Usage:
node scripts/delete-expired.js [mode=0|1|2]

mode:
0 = Only list names of the expired files.
1 = Delete expired files (output file names).
2 = Delete expired files (no output).
```

## rebuild-hashes.js

```none
$ yarn rebuild-hashes -h
$ node ./scripts/rebuild-hashes.js -h
Rebuild file hashes.

Usage:
node scripts/rebuild-hashes.js <mode=0|1|2>

mode:
0 = Dry run (recalculate hashes, print them, but do NOT store to DB).
1 = Recalculate hashes and store to DB.
2 = Verbose (recalculate hashes, print them, and store to DB).
```

## thumbs.js

[\[...\]](https://github.com/BobbyWibowo/lolisafe#script-for-missing-thumbnails)

## bump-versions.js

[\[...\]](https://github.com/BobbyWibowo/lolisafe/tree/safe.fiery.me/src#readme)
