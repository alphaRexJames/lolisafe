/* global swal, axios, videojs, WaveSurfer */

// eslint-disable-next-line no-unused-vars
const lsKeys = {}

const page = {
  urlPrefix: null,
  urlIdentifier: null,

  urlInput: document.querySelector('#identifier'),
  reloadBtn: document.querySelector('#reloadBtn'),
  downloadBtn: document.querySelector('#downloadBtn'),
  uploadRoot: null,
  titleFormat: null,

  videoContainer: document.querySelector('#playerContainer'),
  player: null,

  // Better Cloudflare errors
  cloudflareErrors: {
    520: 'Unknown Error',
    521: 'Web Server Is Down',
    522: 'Connection Timed Out',
    523: 'Origin Is Unreachable',
    524: 'A Timeout Occurred',
    525: 'SSL Handshake Failed',
    526: 'Invalid SSL Certificate',
    527: 'Railgun Error',
    530: 'Origin DNS Error'
  }
}

// Disable video.js telemetry (should already be disabled by default since v7 though)
window.HELP_IMPROVE_VIDEOJS = false

// Handler for regular JS errors
page.onError = error => {
  console.error(error)

  const content = document.createElement('div')
  content.innerHTML = `
    <p><code>${error.toString()}</code></p>
    <p>Please check your console for more information.</p>
  `
  return swal({
    title: 'An error occurred!',
    icon: 'error',
    content
  })
}

// Handler for Axios errors
page.onAxiosError = error => {
  if (!error.response) {
    return page.onError(error)
  }

  const statusText = page.cloudflareErrors[error.response.status] || error.response.statusText

  const description = error.response.data && error.response.data.description
    ? error.response.data.description
    : ''
  return swal(`${error.response.status} ${statusText}`, description, 'error')
}

page.toggleReloadBtn = enabled => {
  if (enabled) {
    page.reloadBtn.classList.remove('is-loading')
    page.reloadBtn.removeAttribute('disabled')
  } else {
    page.reloadBtn.classList.add('is-loading')
    page.reloadBtn.setAttribute('disabled', 'disabled')
  }
}

page.reloadVideo = () => {
  if (!page.urlInput.value) return

  page.toggleReloadBtn(false)
  const src = `${page.uploadRoot}/${page.urlInput.value}`

  axios.head(src).then(response => {
    if (![200, 304].includes(response.status)) {
      page.toggleReloadBtn(true)
      return page.onAxiosError(response)
    }

    const type = response.headers['content-type'] || ''
    const isvideo = type.startsWith('video/')
    const isaudio = type.startsWith('audio/')
    if (!isvideo && !isaudio) {
      page.toggleReloadBtn(true)
      return swal('An error occurred!', 'The requested upload does not appear to be a media file.', 'error')
    }

    page.urlIdentifier = page.urlInput.value

    if (page.player) {
      page.player.dispose()
      page.videoContainer.innerHTML = ''
    }

    const videoElement = document.createElement('video-js')
    videoElement.id = 'video-js'
    videoElement.className = 'video-js vjs-default-skin vjs-fluid vjs-big-play-centered'
    videoElement.setAttribute('controls', true)
    videoElement.setAttribute('preload', 'auto')

    page.videoContainer.appendChild(videoElement)

    const options = {
      language: 'en',
      playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
      responsive: true,
      plugins: {}
    }

    if (isaudio) {
      options.plugins.wavesurfer = {
        responsive: true
      }
    }

    page.player = videojs('video-js', options, () => {
      let message = `Using video.js ${videojs.VERSION}`
      if (isaudio) {
        message += ` with videojs-wavesurfer ${videojs.getPluginVersion('wavesurfer')} and wavesurfer.js ${WaveSurfer.VERSION}`
      }
      videojs.log(message)
      page.player.src({ src, type })
    })
    page.player.seekButtons({ forward: 10, back: 10 })

    const videoJSButton = videojs.getComponent('Button')
    const loopButtonText = () => page.player.loop()
      ? 'Disable loop'
      : 'Enable loop'
    const loopButton = videojs.extend(videoJSButton, {
      constructor () {
        videoJSButton.apply(this, arguments)
        this.addClass('vjs-loop-button')
        this.controlText(loopButtonText())
      },
      handleClick () {
        page.player.loop(!page.player.loop())
        this.toggleClass('vjs-loop-enabled', page.player.loop())
        this.controlText(loopButtonText())
      }
    })
    videojs.registerComponent('loopButton', loopButton)
    page.player.getChild('controlBar').addChild('loopButton')

    if (page.titleFormat) {
      document.title = page.titleFormat.replace(/%identifier%/g, page.urlIdentifier)
    }

    if (page.downloadBtn) {
      page.downloadBtn.setAttribute('href', src)
    }

    window.history.pushState(null, null, page.urlPrefix + page.urlIdentifier)
    page.toggleReloadBtn(true)
  }).catch(error => {
    page.toggleReloadBtn(true)
    if (typeof error.response !== 'undefined') page.onAxiosError(error)
    else page.onError(error)
  })
}

window.addEventListener('DOMContentLoaded', () => {
  const mainScript = document.querySelector('#mainScript')
  if (!mainScript || typeof mainScript.dataset.uploadRoot === 'undefined') return

  page.uploadRoot = mainScript.dataset.uploadRoot
  page.titleFormat = mainScript.dataset.titleFormat

  let urlPrefix = window.location.protocol + '//' + window.location.host
  const match = window.location.pathname.match(/.*\/(.*)$/)
  if (!match || !match[1]) {
    return swal('An error occurred!', 'Failed to parse upload identifier from URL.', 'error')
  }

  page.urlIdentifier = match[1]
  urlPrefix += window.location.pathname.substring(0, window.location.pathname.indexOf(match[1]))
  page.urlPrefix = urlPrefix

  if (!page.urlInput) return
  page.urlInput.value = page.urlIdentifier

  // Prevent default form's submit actio
  const form = document.querySelector('#inputForm')
  form.addEventListener('submit', event => {
    event.preventDefault()
  })

  if (!page.videoContainer) return

  page.reloadBtn = document.querySelector('#reloadBtn')
  if (page.reloadBtn) {
    page.reloadBtn.addEventListener('click', event => {
      if (!form.checkValidity()) return
      page.reloadVideo()
    })
  }

  page.reloadVideo()
})
