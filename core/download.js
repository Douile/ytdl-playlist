const fs = require('fs');
const Async = require('async');
const Ytdl = require('ytdl-core');
const FFmpeg = require('fluent-ffmpeg');

const DEFAULT_THREADS = 6;
const TICKS = '|/-\\';
const TICK_INTERVAL = 100;

var currentDownloads = new Map(),
currentTick = 0,
currentDownload = 0,
loggerInterval;

function mapKeys(map) {
  let keys = [];
  for (let key of map.keys()) {
    keys.push(key);
  }
  return keys;
}

function log(text) {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  console.log(text);
}

function logDownload(title,number) {
  log('--- Downloaded ' + number.toString() + ' _ ' + title);
}

function logUpdate() {
  currentTick += 1;
  let keys = mapKeys(currentDownloads);
  let download;
  if (keys.length === 0) {
    download = ' !No active downloads!';
  } else {
    if (currentTick % 10 === 0) {
      if (currentDownload < keys.length-1) {
        currentDownload += 1;
      } else {
        currentDownload = 0;
      }
    }
    if (currentDownload < keys.length) {
      download = ` [${currentDownload+1}/${keys.length}] ` + currentDownloads.get(keys[currentDownload]);
    } else {
      download = ` [1/${keys.length}] ` + currentDownloads.get(keys[0]);
      currentDownload = 1;
    }
  }
  let tick = TICKS[currentTick % TICKS.length];
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  process.stdout.write(tick + download);
}

// function downloadProgress(percentBar) {
//   return (chunkLength, downloaded, total) => {
//     if (THREADS === 1) {
//       const floatDownloaded = downloaded / total;
//       process.stdout.clearLine();
//       process.stdout.cursorTo(0);
//       process.stdout.write("--- " + percentBar.update(floatDownloaded));
//     }
//   }
// }

function downloadError(outputFilePath,callback) {
  return (e) => {
    try {
      fs.unlinkSync(outputFilePath); // remove file on error
    } catch(e) {};
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    log("--- " + e);
    callback();
  }
}

function downloadEnd(playlistItem,callback) {
  return () => {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    logDownload(playlistItem.title,playlistItem.position+1);
    callback();
  }
}

function downloadVideo(playlistItem, outputFilePath, callback) {

    try {

        // var percentBar = new Progress(20);

        const url = 'https://www.youtube.com/watch?v=' + playlistItem.videoId;
        const stream = Ytdl(url, { filter: (format) => format.container === 'mp4'});
        stream.pipe(fs.createWriteStream(outputFilePath));
        // stream.on('progress', downloadProgress(percentBar));
        stream.on('error', downloadError(outputFilePath,callback));
        stream.on('end', downloadEnd(playlistItem,callback));


    } catch (e) {
        console.log("--- " + e);
        callback();
    }

}

function downloadAudio(playlistItem, outputFilePath, callback) {

    try {

        // var percentBar = new Progress(20);

        const url = 'https://www.youtube.com/watch?v=' + playlistItem.videoId;
        const stream = Ytdl(url, { quality: 'highestaudio' });

        // stream.on('progress', downloadProgress(percentBar));
        stream.on('error', downloadError(outputFilePath,callback));
        stream.on('end', downloadEnd(playlistItem,callback));

        FFmpeg(stream)
            .audioBitrate(192) // 128, 192, 256, 320
            .save(outputFilePath);

    } catch (e) {
        console.log("--- " + e);
        callback();
    }

}

function download(playlist) {

    return new Promise(function (resolve, reject) {

        clearInterval(loggerInterval)
        loggerInterval = setInterval(logUpdate,TICK_INTERVAL);

        let threads = playlist.threads ? playlist.threads : DEFAULT_THREADS;

        Async.eachLimit(playlist.items, threads, function (item, callback) {

            const position = item.position + 1;

            if (playlist.range)
                if (position < playlist.range[0] || (playlist.range[1] && position > playlist.range[1])) {
                    callback();
                    return;
                }

            const extension = playlist.isVideo() ? 'mp4' : 'mp3';
            const pathName = playlist._arrangePathName(item.title);
            const output = `${playlist.getDirPath()}/${pathName}.${extension}`.trim();
            // console.log("--- " + position + " Starting _ " + item.title);
            currentDownloads.set(position,`#${position} :: ${item.title}`);

            if (item.title.toLowerCase() == "private video") { // should be more clever than this check :(
                console.log("--- This content is PRIVATE");
                callback();
                return;
            }

            var loggableCallback = () => {
              currentDownloads.delete(position);
              callback();
            }

            if (playlist.isVideo())
                downloadVideo(item, output, loggableCallback);
            else
                downloadAudio(item, output, loggableCallback);

        }, function(error){
            clearInterval(loggerInterval);
            if(error) reject(error);
            else resolve();
        });
    });

}

module.exports.download = download;
