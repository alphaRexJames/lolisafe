const self = {
  IMAGE_EXTS: ['.gif', '.jpeg', '.jpg', '.png', '.svg', '.tif', '.tiff', '.webp'],
  VIDEO_EXTS: ['.3g2', '.3gp', '.asf', '.avchd', '.avi', '.divx', '.evo', '.flv', '.h264', '.h265', '.hevc', '.m2p', '.m2ts', '.m4v', '.mk3d', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.mxf', '.ogg', '.ogv', '.ps', '.qt', '.rmvb', '.ts', '.vob', '.webm', '.wmv'],
  AUDIO_EXTS: ['.flac', '.mp3', '.wav', '.wma'],
  ANIMATED_EXTS: ['.gif'] // must also exists in either IMAGE_EXTS or VIDEO_EXTS for thumbnails generation
}

module.exports = self
